import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ImapFlow } = require('imapflow');
import * as XLSX from 'xlsx';
import { pipeline } from 'stream/promises';
import { createWriteStream, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface AdStirPacingRecord {
  date: string;
  client: string;
  product: string;
  flightStart: string;
  flightEnd: string;
  cpm: number;
  deliveredImpressions: number;
  deliveryPct: number;
  pacingPct: number;
  ctr: number;
  videoCompletion: number;
  revenue: number;
}

let pacingCache: AdStirPacingRecord[] = [];
let cacheTimestamp = 0;
let reportDate = '';
let fetchInProgress = false;
const CACHE_TTL = 60 * 60 * 1000;
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;
let cronStarted = false;

function getConfig() {
  return {
    host: process.env.ADSTIR_IMAP_HOST || 'imap.gmail.com',
    user: process.env.ADSTIR_IMAP_USER || '',
    password: process.env.ADSTIR_IMAP_PASSWORD || '',
  };
}

function parseDate(val: string | number | null): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  const epoch = new Date(1899, 11, 30);
  epoch.setDate(epoch.getDate() + val);
  const m = String(epoch.getMonth() + 1).padStart(2, '0');
  const d = String(epoch.getDate()).padStart(2, '0');
  return `${m}/${d}/${epoch.getFullYear()}`;
}

function parseRows(rows: unknown[][]): { records: AdStirPacingRecord[]; reportPeriod: string } {
  let reportPeriod = '';
  let headerIdx = -1;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (Array.isArray(row) && String(row[0]).toLowerCase() === 'weekly report') {
      reportPeriod = String(row[1] || '');
    }
    if (Array.isArray(row) && String(row[0]).toLowerCase() === 'date' && String(row[1]).toLowerCase() === 'client') {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return { records: [], reportPeriod };

  const records: AdStirPacingRecord[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 10 || !row[0]) continue;

    records.push({
      date: parseDate(row[0] as string | number | null),
      client: String(row[1] || ''),
      product: String(row[2] || ''),
      flightStart: parseDate(row[3] as string | number | null),
      flightEnd: parseDate(row[4] as string | number | null),
      cpm: typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6]).replace(/[$,\s]/g, '')) || 0,
      deliveredImpressions: typeof row[7] === 'number' ? row[7] : parseInt(String(row[7]).replace(/[\s,]/g, '')) || 0,
      deliveryPct: typeof row[8] === 'number' ? +(row[8] * 100).toFixed(2) : parseFloat(String(row[8]).replace('%', '')) || 0,
      pacingPct: typeof row[9] === 'number' ? +(row[9] * 100).toFixed(2) : parseFloat(String(row[9]).replace('%', '')) || 0,
      ctr: typeof row[10] === 'number' ? +(row[10] * 100).toFixed(2) : parseFloat(String(row[10]).replace('%', '')) || 0,
      videoCompletion: typeof row[11] === 'number' ? row[11] : parseInt(String(row[11]).replace(/[\s,]/g, '')) || 0,
      revenue: typeof row[12] === 'number' ? row[12] : parseFloat(String(row[12]).replace(/[$,\s]/g, '')) || 0,
    });
  }

  return { records, reportPeriod };
}

async function fetchFromEmail(): Promise<{ records: AdStirPacingRecord[]; reportPeriod: string }> {
  const { host, user, password } = getConfig();

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const uids: number[] = [];
    for await (const msg of client.fetch('1:*', { envelope: true, bodyStructure: true, uid: true })) {
      if (
        msg.envelope.subject?.toLowerCase().includes('pacing') &&
        msg.envelope.from?.[0]?.address?.includes('adstir')
      ) {
        const hasXlsx = JSON.stringify(msg.bodyStructure).includes('.xlsx');
        if (hasXlsx) uids.push(msg.uid);
      }
    }

    if (uids.length === 0) return { records: [], reportPeriod: '' };

    const latestUid = uids[uids.length - 1];
    const tmpPath = join(tmpdir(), `adstir_pacing_${Date.now()}.xlsx`);

    const { content } = await client.download(latestUid, '2', { uid: true });
    await pipeline(content, createWriteStream(tmpPath));

    const buf = readFileSync(tmpPath);
    unlinkSync(tmpPath);

    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    return parseRows(rows);
  } finally {
    lock.release();
    await client.logout();
  }
}

async function backgroundRefresh() {
  if (fetchInProgress) return;
  const { user, password } = getConfig();
  if (!user || !password) return;
  fetchInProgress = true;
  try {
    const { records, reportPeriod } = await fetchFromEmail();
    pacingCache = records;
    reportDate = reportPeriod;
    cacheTimestamp = Date.now();
    console.log(`[AdStir Pacing Cron] Refreshed ${records.length} records at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[AdStir Pacing Cron] Failed:', err);
  } finally {
    fetchInProgress = false;
  }
}

function startCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(backgroundRefresh, DAILY_INTERVAL);
  setTimeout(backgroundRefresh, 5000);
  console.log('[AdStir Pacing Cron] Scheduled daily email check');
}

startCron();

export async function GET(request: Request) {
  try {
    const { user, password } = getConfig();
    if (!user || !password) {
      return NextResponse.json({ error: 'Email credentials not configured', data: [] }, { status: 503 });
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && pacingCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ data: pacingCache, reportDate, fromCache: true });
    }

    if (fetchInProgress) {
      if (pacingCache.length > 0) {
        return NextResponse.json({ data: pacingCache, reportDate, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const { records, reportPeriod } = await fetchFromEmail();
      pacingCache = records;
      reportDate = reportPeriod;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: records, reportDate: reportPeriod });
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (pacingCache.length > 0) {
      return NextResponse.json({ data: pacingCache, reportDate, fromCache: true, stale: true });
    }
    console.error('Error fetching AdStir pacing data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pacing data', data: [] },
      { status: 500 }
    );
  }
}
