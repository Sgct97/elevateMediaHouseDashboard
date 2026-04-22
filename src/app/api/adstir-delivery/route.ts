import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ImapFlow } = require('imapflow');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { simpleParser } = require('mailparser');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yauzl = require('yauzl');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zipcodes = require('zipcodes');
import { pipeline } from 'stream/promises';
import { createWriteStream, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';
import { Readable } from 'stream';

export interface PublisherAggregate {
  publisher: string;
  impressions: number;
  completedViews: number;
  clicks: number;
}

export interface ZipAggregate {
  zip: string;
  impressions: number;
  completedViews: number;
  clicks: number;
  lat?: number;
  lng?: number;
  city?: string;
  state?: string;
}

export interface CampaignDelivery {
  campaign: string;
  advertiser: string;
  advertiserId: string;
  flightStart: string;
  totalImpressions: number;
  totalCompletedViews: number;
  totalClicks: number;
  publishers: PublisherAggregate[];
  zips: ZipAggregate[];
}

interface DeliveryData {
  campaigns: CampaignDelivery[];
  reportDate: string;
  emailDate: string;
}

let deliveryCache: DeliveryData = { campaigns: [], reportDate: '', emailDate: '' };
let cacheTimestamp = 0;
let fetchInProgress = false;
let cronStarted = false;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

function getConfig() {
  return {
    host: process.env.ADSTIR_IMAP_HOST || 'imap.gmail.com',
    user: process.env.ADSTIR_IMAP_USER || '',
    password: process.env.ADSTIR_IMAP_PASSWORD || '',
  };
}

function extractDownloadUrl(textBody: string): string | null {
  const match = textBody.match(/https:\/\/adstir-reports\.s3[^\s<>"]+/);
  return match ? match[0] : null;
}

async function findLatestReportEmail(): Promise<{ url: string; emailDate: string } | null> {
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
    const matches: { uid: number; date: Date }[] = [];
    for await (const msg of client.fetch('1:*', { envelope: true, uid: true })) {
      const subj = (msg.envelope.subject || '').toLowerCase();
      const from = msg.envelope.from?.[0]?.address || '';
      if (
        subj.includes('delivery report') &&
        subj.includes('daily impression') &&
        from.toLowerCase().includes('adstir')
      ) {
        matches.push({ uid: msg.uid, date: new Date(msg.envelope.date) });
      }
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = matches[0];

    const fullMsg = await client.fetchOne(latest.uid, { source: true }, { uid: true });
    const parsed = await simpleParser(fullMsg.source);
    const url = extractDownloadUrl(parsed.text || '');

    if (!url) return null;
    return { url, emailDate: latest.date.toISOString() };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function downloadAndExtract(url: string): Promise<string> {
  const stamp = Date.now();
  const zipPath = join(tmpdir(), `adstir_delivery_${stamp}.zip`);
  const csvPath = join(tmpdir(), `adstir_delivery_${stamp}.csv`);

  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);

  await pipeline(
    Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream),
    createWriteStream(zipPath)
  );

  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err: Error | null, zipfile: unknown) => {
      if (err || !zipfile) return reject(err || new Error('Failed to open zip'));
      const zf = zipfile as {
        readEntry: () => void;
        on: (event: string, cb: (...args: unknown[]) => void) => void;
        close: () => void;
        openReadStream: (entry: unknown, cb: (e: Error | null, s: NodeJS.ReadableStream) => void) => void;
      };

      let found = false;
      zf.readEntry();
      zf.on('entry', (entryArg: unknown) => {
        const entry = entryArg as { fileName: string };
        if (!entry.fileName.toLowerCase().endsWith('.csv')) {
          zf.readEntry();
          return;
        }
        found = true;
        zf.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            zf.close();
            return reject(streamErr);
          }
          const writeStream = createWriteStream(csvPath);
          readStream.on('error', (e) => { zf.close(); reject(e); });
          writeStream.on('error', (e) => { zf.close(); reject(e); });
          writeStream.on('finish', () => { zf.close(); resolve(); });
          readStream.pipe(writeStream);
        });
      });
      zf.on('end', () => {
        if (!found) {
          zf.close();
          reject(new Error('No CSV file found in archive'));
        }
      });
      zf.on('error', (errArg: unknown) => reject(errArg as Error));
    });
  });

  try { unlinkSync(zipPath); } catch {}
  return csvPath;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function aggregateCsv(csvPath: string): Promise<CampaignDelivery[]> {
  const stream = require('fs').createReadStream(csvPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  type CampaignKey = string;
  const campaignMap = new Map<CampaignKey, {
    campaign: string;
    advertiser: string;
    advertiserId: string;
    flightStart: string;
    publishers: Map<string, PublisherAggregate>;
    zips: Map<string, ZipAggregate>;
  }>();

  let headerIdx: Record<string, number> | null = null;
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (!line) continue;

    if (headerIdx === null) {
      const cols = parseCsvLine(line);
      headerIdx = {};
      cols.forEach((c, i) => { headerIdx![c.trim()] = i; });
      continue;
    }

    const cols = parseCsvLine(line);
    const advertiser = cols[headerIdx['Advertiser']] || '';
    const advertiserId = cols[headerIdx['Advertiser ID']] || '';
    const campaign = cols[headerIdx['Campaign']] || '';
    const publisher = cols[headerIdx['Publisher Network']] || '';
    const zip = cols[headerIdx['ZipCode']] || '';
    const impressions = parseInt(cols[headerIdx['Impressions']] || '0', 10) || 0;
    const completedViews = parseInt(cols[headerIdx['Completed Views']] || '0', 10) || 0;
    const clicks = parseInt(cols[headerIdx['Clicks']] || '0', 10) || 0;
    const flightStart = cols[headerIdx['Flight Start Date']] || '';

    if (!campaign) continue;

    const key = `${advertiserId}|||${campaign}`;
    let entry = campaignMap.get(key);
    if (!entry) {
      entry = {
        campaign,
        advertiser,
        advertiserId,
        flightStart,
        publishers: new Map(),
        zips: new Map(),
      };
      campaignMap.set(key, entry);
    }

    if (publisher) {
      const p = entry.publishers.get(publisher) || { publisher, impressions: 0, completedViews: 0, clicks: 0 };
      p.impressions += impressions;
      p.completedViews += completedViews;
      p.clicks += clicks;
      entry.publishers.set(publisher, p);
    }

    if (zip) {
      const z = entry.zips.get(zip) || { zip, impressions: 0, completedViews: 0, clicks: 0 };
      z.impressions += impressions;
      z.completedViews += completedViews;
      z.clicks += clicks;
      entry.zips.set(zip, z);
    }
  }

  const result: CampaignDelivery[] = [];
  for (const entry of campaignMap.values()) {
    const publishers = Array.from(entry.publishers.values()).sort((a, b) => b.impressions - a.impressions);
    const zips = Array.from(entry.zips.values())
      .map(z => {
        const geo = zipcodes.lookup(z.zip);
        return geo
          ? { ...z, lat: geo.latitude, lng: geo.longitude, city: geo.city, state: geo.state }
          : z;
      })
      .sort((a, b) => b.impressions - a.impressions);
    const totalImpressions = publishers.reduce((s, p) => s + p.impressions, 0);
    const totalCompletedViews = publishers.reduce((s, p) => s + p.completedViews, 0);
    const totalClicks = publishers.reduce((s, p) => s + p.clicks, 0);

    result.push({
      campaign: entry.campaign,
      advertiser: entry.advertiser,
      advertiserId: entry.advertiserId,
      flightStart: entry.flightStart,
      totalImpressions,
      totalCompletedViews,
      totalClicks,
      publishers,
      zips,
    });
  }

  result.sort((a, b) => b.totalImpressions - a.totalImpressions);
  console.log(`[AdStir Delivery] Aggregated ${lineNum - 1} rows into ${result.length} campaigns`);
  return result;
}

async function refreshData(): Promise<DeliveryData> {
  const email = await findLatestReportEmail();
  if (!email) {
    console.warn('[AdStir Delivery] No matching email found');
    return { campaigns: [], reportDate: '', emailDate: '' };
  }

  const csvPath = await downloadAndExtract(email.url);
  try {
    const campaigns = await aggregateCsv(csvPath);
    return {
      campaigns,
      reportDate: new Date().toISOString(),
      emailDate: email.emailDate,
    };
  } finally {
    try { unlinkSync(csvPath); } catch {}
  }
}

async function backgroundRefresh() {
  if (fetchInProgress) return;
  const { user, password } = getConfig();
  if (!user || !password) return;
  fetchInProgress = true;
  try {
    const data = await refreshData();
    deliveryCache = data;
    cacheTimestamp = Date.now();
    console.log(`[AdStir Delivery Cron] Refreshed ${data.campaigns.length} campaigns at ${new Date().toISOString()}`);
    if (typeof global.gc === 'function') global.gc();
  } catch (err) {
    console.error('[AdStir Delivery Cron] Failed:', err);
  } finally {
    fetchInProgress = false;
  }
}

function startCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(backgroundRefresh, DAILY_INTERVAL);
  setTimeout(backgroundRefresh, 10000);
  console.log('[AdStir Delivery Cron] Scheduled (daily)');
}

startCron();

export async function GET(request: Request) {
  try {
    const { user, password } = getConfig();
    if (!user || !password) {
      return NextResponse.json({ error: 'Email credentials not configured', campaigns: [] }, { status: 503 });
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const now = Date.now();

    if (!forceRefresh && deliveryCache.campaigns.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ ...deliveryCache, fromCache: true });
    }

    if (fetchInProgress) {
      if (deliveryCache.campaigns.length > 0) {
        return NextResponse.json({ ...deliveryCache, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ campaigns: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const data = await refreshData();
      deliveryCache = data;
      cacheTimestamp = Date.now();
      return NextResponse.json(data);
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (deliveryCache.campaigns.length > 0) {
      return NextResponse.json({ ...deliveryCache, fromCache: true, stale: true });
    }
    console.error('[AdStir Delivery] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch delivery data', campaigns: [] },
      { status: 500 }
    );
  }
}
