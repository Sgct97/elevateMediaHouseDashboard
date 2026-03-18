import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const BUCKET_NAME = 'elevate-adstir-data-v2';
const REGION = 'us-east-2';

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || '',
  },
});

export interface AdStirRecord {
  date: string;
  advertiser: string;
  advertiserId: string;
  campaign: string;
  campaignId: string;
  impressions: number;
  uniqueImpressions: number;
  impressionsPerUser: number;
  completedViews: number;
  completedViewsPct: number;
  clicks: number;
  clicksPct: number;
}

let adstirCache: AdStirRecord[] = [];
let cacheTimestamp: number = 0;
let fetchInProgress = false;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function parseCSV(csv: string): AdStirRecord[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const records: AdStirRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 12) continue;

    records.push({
      date: cols[0],
      advertiser: cols[1],
      advertiserId: cols[2],
      campaign: cols[3],
      campaignId: cols[4],
      impressions: parseInt(cols[5]) || 0,
      uniqueImpressions: parseInt(cols[6]) || 0,
      impressionsPerUser: parseFloat(cols[7]) || 0,
      completedViews: parseInt(cols[8]) || 0,
      completedViewsPct: parseFloat(cols[9]) || 0,
      clicks: parseInt(cols[10]) || 0,
      clicksPct: parseFloat(cols[11]) || 0,
    });
  }
  return records;
}

async function fetchAllCSVFiles(): Promise<AdStirRecord[]> {
  const listCommand = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
  const listResult = await s3.send(listCommand);

  const csvFiles = (listResult.Contents || [])
    .filter(obj => obj.Key?.endsWith('.csv') && obj.Key !== 'testS3Bucket.csv')
    .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));

  if (csvFiles.length === 0) return [];

  // The large historical file + daily files may have overlapping data.
  // Deduplicate by date + campaignId, keeping the latest version.
  const allRecords = new Map<string, AdStirRecord>();

  for (const file of csvFiles) {
    if (!file.Key) continue;
    const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key });
    const result = await s3.send(getCommand);
    const body = await result.Body?.transformToString();
    if (!body) continue;

    const records = parseCSV(body);
    for (const record of records) {
      const key = `${record.date}_${record.campaignId}`;
      if (!allRecords.has(key)) {
        allRecords.set(key, record);
      }
    }
  }

  return Array.from(allRecords.values());
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
    if (!forceRefresh && adstirCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ data: adstirCache, fromCache: true, fetchedAt: new Date(cacheTimestamp).toISOString() });
    }

    if (fetchInProgress) {
      if (adstirCache.length > 0) {
        return NextResponse.json({ data: adstirCache, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const records = await fetchAllCSVFiles();
      adstirCache = records;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: records, fetchedAt: new Date().toISOString() });
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (adstirCache.length > 0) {
      return NextResponse.json({ data: adstirCache, fromCache: true, stale: true });
    }
    console.error('Error fetching AdStir data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AdStir data', message: error instanceof Error ? error.message : 'Unknown error', data: [] },
      { status: 500 }
    );
  }
}
