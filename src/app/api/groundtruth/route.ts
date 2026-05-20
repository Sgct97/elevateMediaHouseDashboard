import { NextResponse } from 'next/server';
import { type ClientFilter, getClientFilterFromUrl, matchesClientFilter } from '@/lib/clientFilters';

const REPORTING_BASE = 'https://reporting.groundtruth.com';

export interface GroundTruthCampaign {
  campaignId: number;
  campaignName: string;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
}

let dataCache: GroundTruthCampaign[] = [];
let cacheTimestamp = 0;
let fetchInProgress = false;
let cronStarted = false;
const CACHE_TTL = 60 * 60 * 1000;
const REFRESH_INTERVAL = 4 * 60 * 60 * 1000;

function filterCampaigns(data: GroundTruthCampaign[], filter: ClientFilter | null): GroundTruthCampaign[] {
  return data.filter(campaign => matchesClientFilter(filter, [
    campaign.campaignName,
    campaign.campaignId,
  ]));
}

function getConfig() {
  return {
    userId: process.env.GROUNDTRUTH_USER_ID || '',
    apiKey: process.env.GROUNDTRUTH_API_KEY || '',
    accountId: process.env.GROUNDTRUTH_ACCOUNT_ID || '',
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

async function fetchWeek(accountId: string, startDate: string, endDate: string, userId: string, apiKey: string): Promise<unknown[]> {
  const url = `${REPORTING_BASE}/demand/v1/account/${accountId}/totals?start_date=${startDate}&end_date=${endDate}&all_campaigns=1`;
  const res = await fetch(url, {
    headers: {
      'X-GT-USER-ID': userId,
      'X-GT-API-KEY': apiKey,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
  });

  if (!res.ok) return [];

  try {
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

async function fetchAllData(startOverride?: Date | null, endOverride?: Date | null): Promise<GroundTruthCampaign[]> {
  const { userId, apiKey, accountId } = getConfig();

  const now = new Date();
  const windowStart = startOverride || new Date(now);
  if (!startOverride) windowStart.setDate(windowStart.getDate() - 90);
  const windowEnd = endOverride && endOverride < now ? endOverride : now;

  const weeks: { start: string; end: string }[] = [];
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > windowEnd) weekEnd.setTime(windowEnd.getTime());
    weeks.push({ start: formatDate(cursor), end: formatDate(weekEnd) });
    cursor.setDate(cursor.getDate() + 7);
  }

  const merged = new Map<number, { name: string; impressions: number; reach: number; clicks: number }>();

  for (const week of weeks) {
    const rows = await fetchWeek(accountId, week.start, week.end, userId, apiKey);
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const id = r.campaign_id as number;
      const name = (r.campaign_name as string) || '';
      const impressions = (r.impressions as number) || 0;
      const reach = (r.cumulative_reach as number) || 0;
      const clicks = (r.clicks as number) || 0;

      const existing = merged.get(id);
      if (existing) {
        existing.impressions += impressions;
        existing.reach = Math.max(existing.reach, reach);
        existing.clicks += clicks;
      } else {
        merged.set(id, { name, impressions, reach, clicks });
      }
    }
  }

  return Array.from(merged.entries()).map(([id, data]) => ({
    campaignId: id,
    campaignName: data.name,
    impressions: data.impressions,
    reach: data.reach,
    clicks: data.clicks,
    ctr: data.impressions > 0 ? +((data.clicks / data.impressions) * 100).toFixed(2) : 0,
  }));
}

async function backgroundRefresh() {
  if (fetchInProgress) return;
  const { userId, apiKey, accountId } = getConfig();
  if (!userId || !apiKey || !accountId) return;
  fetchInProgress = true;
  try {
    const records = await fetchAllData();
    dataCache = records;
    cacheTimestamp = Date.now();
    console.log(`[GroundTruth Cron] Refreshed ${records.length} campaigns at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[GroundTruth Cron] Failed:', err);
  } finally {
    fetchInProgress = false;
  }
}

function startCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(backgroundRefresh, REFRESH_INTERVAL);
  setTimeout(backgroundRefresh, 16000);
  console.log('[GroundTruth Cron] Scheduled (every 4 hours)');
}

startCron();

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const clientFilter = getClientFilterFromUrl(requestUrl);
  try {
    const { userId, apiKey, accountId } = getConfig();
    if (!userId || !apiKey || !accountId) {
      return NextResponse.json(
        { error: 'GroundTruth credentials not configured', data: [] },
        { status: 503 }
      );
    }

    const forceRefresh = requestUrl.searchParams.get('refresh') === 'true';
    const startDate = parseDateParam(requestUrl.searchParams.get('start'));
    const endDate = parseDateParam(requestUrl.searchParams.get('end'));
    const hasCustomDateRange = Boolean(startDate || endDate);

    const now = Date.now();
    if (!hasCustomDateRange && !forceRefresh && dataCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ data: filterCampaigns(dataCache, clientFilter), fromCache: true, fetchedAt: new Date(cacheTimestamp).toISOString() });
    }

    if (!hasCustomDateRange && fetchInProgress) {
      if (dataCache.length > 0) {
        return NextResponse.json({ data: filterCampaigns(dataCache, clientFilter), fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    if (hasCustomDateRange) {
      const records = await fetchAllData(startDate, endDate);
      return NextResponse.json({ data: filterCampaigns(records, clientFilter), fetchedAt: new Date().toISOString() });
    }

    fetchInProgress = true;
    try {
      const records = await fetchAllData();
      dataCache = records;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: filterCampaigns(records, clientFilter), fetchedAt: new Date().toISOString() });
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (dataCache.length > 0) {
      return NextResponse.json({ data: filterCampaigns(dataCache, clientFilter), fromCache: true, stale: true });
    }
    console.error('Error fetching GroundTruth data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch GroundTruth data', message: error instanceof Error ? error.message : 'Unknown error', data: [] },
      { status: 500 }
    );
  }
}
