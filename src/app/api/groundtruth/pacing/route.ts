import { NextResponse } from 'next/server';

const MANAGEMENT_BASE = 'https://api-public.groundtruth.com';
const REPORTING_BASE = 'https://reporting.groundtruth.com';

export interface PacingCampaign {
  campaignId: number;
  campaignName: string;
  status: 'Active' | 'Expired' | 'Scheduled';
  budget: number;
  startDate: string;
  endDate: string;
  spend: number;
  pacing: number;
}

let pacingCache: PacingCampaign[] = [];
let cacheTimestamp = 0;
let fetchInProgress = false;
let cronStarted = false;
const CACHE_TTL = 60 * 60 * 1000;
const REFRESH_INTERVAL = 4 * 60 * 60 * 1000;

function getConfig() {
  return {
    userId: process.env.GROUNDTRUTH_USER_ID || '',
    apiKey: process.env.GROUNDTRUTH_API_KEY || '',
    accountId: process.env.GROUNDTRUTH_ACCOUNT_ID || '',
    tenantId: process.env.GROUNDTRUTH_TENANT_ID || '',
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface CampaignConfig {
  id: number;
  name: string;
  budget: number;
  start_date: string;
  end_date: string;
  status: number;
}

async function fetchCampaignConfigs(tenantId: string, accountId: string, userId: string, apiKey: string): Promise<CampaignConfig[]> {
  const campaigns: CampaignConfig[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${MANAGEMENT_BASE}/campaigns?tenant_id=${tenantId}&account_id=${accountId}&limit=50&page_num=${page}`;
    const res = await fetch(url, {
      headers: {
        'X-GT-USER-ID': userId,
        'X-GT-API-KEY': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) break;

    const data = await res.json();
    if (data.items && Array.isArray(data.items)) {
      campaigns.push(...data.items);
    }
    hasMore = data.has_next_page === true;
    page++;
  }

  return campaigns;
}

async function fetchSpendData(accountId: string, userId: string, apiKey: string, earliestStart: Date): Promise<Map<number, number>> {
  const now = new Date();
  const spendMap = new Map<number, number>();

  const cursor = new Date(earliestStart);
  while (cursor < now) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > now) weekEnd.setTime(now.getTime());

    const url = `${REPORTING_BASE}/demand/v1/account/${accountId}/totals?start_date=${formatDate(cursor)}&end_date=${formatDate(weekEnd)}&all_campaigns=1`;

    try {
      const res = await fetch(url, {
        headers: {
          'X-GT-USER-ID': userId,
          'X-GT-API-KEY': apiKey,
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const row of data) {
            const id = row.campaign_id as number;
            const spend = (row.spend as number) || 0;
            spendMap.set(id, (spendMap.get(id) || 0) + spend);
          }
        }
      }
    } catch {
      // continue with next window
    }

    cursor.setDate(cursor.getDate() + 7);
  }

  return spendMap;
}

function getStatus(startDate: string, endDate: string): 'Active' | 'Expired' | 'Scheduled' {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');

  if (today > end) return 'Expired';
  if (today >= start) return 'Active';
  return 'Scheduled';
}

function calculatePacing(budget: number, spend: number, startDate: string, endDate: string, status: string): number {
  if (budget <= 0) return 0;

  if (status === 'Expired') {
    return +((spend / budget) * 100).toFixed(2);
  }

  if (status === 'Scheduled') {
    return 0;
  }

  // Active: compare actual spend vs expected spend at this point in the flight
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (86400000));
  const daysElapsed = Math.max(1, (today.getTime() - start.getTime()) / (86400000));

  const expectedSpend = (daysElapsed / totalDays) * budget;
  if (expectedSpend <= 0) return 0;

  return +((spend / expectedSpend) * 100).toFixed(2);
}

async function fetchAllPacingData(): Promise<PacingCampaign[]> {
  const { userId, apiKey, accountId, tenantId } = getConfig();

  const configs = await fetchCampaignConfigs(tenantId, accountId, userId, apiKey);
  if (configs.length === 0) return [];

  const dates = configs.map(c => new Date(c.start_date)).filter(d => !isNaN(d.getTime()));
  const earliestStart = new Date(Math.min(...dates.map(d => d.getTime())));

  const spendMap = await fetchSpendData(accountId, userId, apiKey, earliestStart);

  return configs.map(c => {
    const status = getStatus(c.start_date, c.end_date);
    const spend = spendMap.get(c.id) || 0;
    const pacing = calculatePacing(c.budget, spend, c.start_date, c.end_date, status);

    return {
      campaignId: c.id,
      campaignName: c.name,
      status,
      budget: c.budget,
      startDate: c.start_date,
      endDate: c.end_date,
      spend: +spend.toFixed(2),
      pacing,
    };
  });
}

async function backgroundRefresh() {
  if (fetchInProgress) return;
  const { userId, apiKey, accountId, tenantId } = getConfig();
  if (!userId || !apiKey || !accountId || !tenantId) return;
  fetchInProgress = true;
  try {
    const records = await fetchAllPacingData();
    pacingCache = records;
    cacheTimestamp = Date.now();
    console.log(`[GroundTruth Pacing Cron] Refreshed ${records.length} campaigns at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[GroundTruth Pacing Cron] Failed:', err);
  } finally {
    fetchInProgress = false;
  }
}

function startCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(backgroundRefresh, REFRESH_INTERVAL);
  setTimeout(backgroundRefresh, 18000);
  console.log('[GroundTruth Pacing Cron] Scheduled (every 4 hours)');
}

startCron();

export async function GET(request: Request) {
  try {
    const { userId, apiKey, accountId, tenantId } = getConfig();
    if (!userId || !apiKey || !accountId || !tenantId) {
      return NextResponse.json({ error: 'GroundTruth credentials not configured', data: [] }, { status: 503 });
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && pacingCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ data: pacingCache, fromCache: true });
    }

    if (fetchInProgress) {
      if (pacingCache.length > 0) {
        return NextResponse.json({ data: pacingCache, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const records = await fetchAllPacingData();
      pacingCache = records;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: records });
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (pacingCache.length > 0) {
      return NextResponse.json({ data: pacingCache, fromCache: true, stale: true });
    }
    console.error('Error fetching GroundTruth pacing data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pacing data', data: [] },
      { status: 500 }
    );
  }
}
