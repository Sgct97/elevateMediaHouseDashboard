import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const BUCKET_NAME = 'elevate-adstir-data-v2';
const REGION = 'us-east-2';
const PREFIX = 'pacing-reports/';

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || '',
  },
});

export interface PacingRecord {
  advertiser: string;
  campaignId: string;
  campaignName: string;
  creativeType: string;
  flightStartDate: string;
  flightEndDate: string;
  orderedBudget: number;
  deliveredBudget: number;
  deliveryPct: number;
  expectedDeliveryPct: number;
  pacingPct: number;
  yesterdayDeliveryPct: number;
  referenceNumber: string;
  flightId: string;
  budgetIsDollar: boolean;
}

let pacingCache: PacingRecord[] = [];
let cacheTimestamp: number = 0;
let fetchInProgress = false;
const CACHE_TTL = 60 * 60 * 1000;

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function cleanNumber(val: string): { num: number; isDollar: boolean } {
  const isDollar = val.includes('$');
  const cleaned = val.replace(/[$%,]/g, '');
  return { num: parseFloat(cleaned) || 0, isDollar };
}

function cleanPct(val: string): number {
  return parseFloat(val.replace('%', '')) || 0;
}

function parsePacingCSV(csv: string): PacingRecord[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const records: PacingRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 12) continue;

    const ordered = cleanNumber(cols[6]);

    records.push({
      advertiser: cols[0],
      campaignId: cols[1],
      campaignName: cols[2],
      creativeType: cols[3],
      flightStartDate: cols[4],
      flightEndDate: cols[5],
      orderedBudget: ordered.num,
      deliveredBudget: cleanNumber(cols[7]).num,
      deliveryPct: cleanPct(cols[8]),
      expectedDeliveryPct: cleanPct(cols[9]),
      pacingPct: cleanPct(cols[10]),
      yesterdayDeliveryPct: cleanPct(cols[11]),
      referenceNumber: cols[12] || '',
      flightId: cols[13] || '',
      budgetIsDollar: ordered.isDollar,
    });
  }
  return records;
}

async function fetchPacingFiles(): Promise<PacingRecord[]> {
  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: PREFIX,
  });
  const listResult = await s3.send(listCommand);

  const csvFiles = (listResult.Contents || [])
    .filter(obj => obj.Key?.endsWith('.csv'))
    .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));

  if (csvFiles.length === 0) return [];

  // Use the most recent file — pacing report is a full snapshot each day
  const latestFile = csvFiles[0];
  if (!latestFile.Key) return [];

  const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: latestFile.Key });
  const result = await s3.send(getCommand);
  const body = await result.Body?.transformToString();
  if (!body) return [];

  return parsePacingCSV(body);
}

export async function GET(request: Request) {
  try {
    if (!process.env.AWS_S3_ACCESS_KEY_ID || !process.env.AWS_S3_SECRET_ACCESS_KEY) {
      return NextResponse.json(
        { error: 'AWS S3 credentials not configured', data: [] },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && pacingCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ data: pacingCache, fromCache: true, fetchedAt: new Date(cacheTimestamp).toISOString() });
    }

    if (fetchInProgress) {
      if (pacingCache.length > 0) {
        return NextResponse.json({ data: pacingCache, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const records = await fetchPacingFiles();
      pacingCache = records;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: records, fetchedAt: new Date().toISOString() });
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (pacingCache.length > 0) {
      return NextResponse.json({ data: pacingCache, fromCache: true, stale: true });
    }
    console.error('Error fetching pacing data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pacing data', message: error instanceof Error ? error.message : 'Unknown error', data: [] },
      { status: 500 }
    );
  }
}
