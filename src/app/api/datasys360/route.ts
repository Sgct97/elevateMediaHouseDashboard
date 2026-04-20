import { NextResponse } from 'next/server';

const BASE_URL = 'https://www.datasys360.com/api/v3';

export interface Datasys360Campaign {
  socialCampaignId: number;
  campaignName: string;
  advertiserName: string;
  startDate: string;
  endDate: string;
  orderedImpressions: number;
  configuredFrequency: number;
  totalReach: number;
  totalImpressions: number;
  linkClicks: number;
  ctr: number;
  uniqueCtr: number;
  frequency: number;
}

interface CampaignListItem {
  social_id: number;
  campaign_name: string;
  create_date?: string;
}

interface CampaignDetail {
  social_id: number;
  advertiser_id: number;
  campaign_name: string;
  impressions?: number;
  frequenncy?: number;
  start_date?: string;
  end_date?: string;
}

interface Advertiser {
  advertiser_id: number;
  company_name: string;
}

interface SocialStats {
  reach?: number;
  impressions?: number;
  clicks?: number;
  frequency?: number;
  ctr?: number;
  unique_ctr?: number;
}

let dataCache: Datasys360Campaign[] = [];
let cacheTimestamp = 0;
let fetchInProgress = false;
let cronStarted = false;
const CACHE_TTL = 60 * 60 * 1000;
const REFRESH_INTERVAL = 60 * 60 * 1000;

function getApiKey(): string {
  return process.env.DATASYS360_API_KEY || '';
}

async function apiGet<T>(path: string): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('DATASYS360_API_KEY not configured');

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || body.status !== 1) return null;
  return body.data as T;
}

async function fetchAllCampaigns(): Promise<CampaignListItem[]> {
  const all: CampaignListItem[] = [];
  const limit = 100;
  for (let page = 1; page <= 20; page++) {
    const data = await apiGet<{ campaigns: CampaignListItem[]; total_campaigns: number }>(
      `/social/campaigns?limit=${limit}&page=${page}`
    );
    if (!data || !Array.isArray(data.campaigns) || data.campaigns.length === 0) break;
    all.push(...data.campaigns);
    if (all.length >= (data.total_campaigns || 0)) break;
  }
  return all;
}

async function fetchCampaignDetail(socialId: number): Promise<CampaignDetail | null> {
  return apiGet<CampaignDetail>(`/social/campaign/${socialId}`);
}

async function fetchCampaignStats(socialId: number): Promise<SocialStats | null> {
  return apiGet<SocialStats>(`/social/campaign/stats/${socialId}`);
}

const advertiserCache = new Map<number, string>();
async function fetchAdvertiserName(advertiserId: number): Promise<string> {
  if (advertiserCache.has(advertiserId)) return advertiserCache.get(advertiserId)!;
  const data = await apiGet<Advertiser>(`/advertiser/${advertiserId}`);
  const name = data?.company_name || `Advertiser ${advertiserId}`;
  advertiserCache.set(advertiserId, name);
  return name;
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function buildAllCampaigns(): Promise<Datasys360Campaign[]> {
  const list = await fetchAllCampaigns();
  if (list.length === 0) return [];

  const enriched = await runWithConcurrency(list, 6, async (item) => {
    const [detail, stats] = await Promise.all([
      fetchCampaignDetail(item.social_id),
      fetchCampaignStats(item.social_id),
    ]);

    let advertiserName = '';
    if (detail?.advertiser_id) {
      try { advertiserName = await fetchAdvertiserName(detail.advertiser_id); } catch {}
    }

    const s: SocialStats = stats || {};
    const impressions = s.impressions ?? 0;
    const reach = s.reach ?? 0;
    const clicks = s.clicks ?? 0;
    const computedFreq = reach > 0 ? impressions / reach : 0;

    const record: Datasys360Campaign = {
      socialCampaignId: item.social_id,
      campaignName: detail?.campaign_name || item.campaign_name,
      advertiserName,
      startDate: detail?.start_date || '',
      endDate: detail?.end_date || '',
      orderedImpressions: detail?.impressions || 0,
      configuredFrequency: detail?.frequenncy || 0,
      totalReach: reach,
      totalImpressions: impressions,
      linkClicks: clicks,
      ctr: s.ctr ?? 0,
      uniqueCtr: s.unique_ctr ?? 0,
      frequency: s.frequency ?? computedFreq,
    };
    return record;
  });

  return enriched.filter(Boolean).sort((a, b) => b.totalImpressions - a.totalImpressions);
}

async function backgroundRefresh() {
  if (fetchInProgress) return;
  if (!getApiKey()) return;
  fetchInProgress = true;
  try {
    const data = await buildAllCampaigns();
    dataCache = data;
    cacheTimestamp = Date.now();
    console.log(`[Datasys360 Cron] Refreshed ${data.length} campaigns at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[Datasys360 Cron] Failed:', err);
  } finally {
    fetchInProgress = false;
  }
}

function startCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(backgroundRefresh, REFRESH_INTERVAL);
  setTimeout(backgroundRefresh, 8000);
  console.log('[Datasys360 Cron] Scheduled (hourly refresh)');
}

startCron();

export async function GET(request: Request) {
  try {
    if (!getApiKey()) {
      return NextResponse.json(
        { error: 'DATASYS360_API_KEY not configured', data: [] },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const now = Date.now();

    if (!forceRefresh && dataCache.length > 0 && now - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json({ data: dataCache, fromCache: true });
    }

    if (fetchInProgress) {
      if (dataCache.length > 0) {
        return NextResponse.json({ data: dataCache, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const data = await buildAllCampaigns();
      dataCache = data;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data });
    } finally {
      fetchInProgress = false;
    }
  } catch (err) {
    if (dataCache.length > 0) {
      return NextResponse.json({ data: dataCache, fromCache: true, stale: true });
    }
    console.error('[Datasys360] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch Datasys360 data', data: [] },
      { status: 500 }
    );
  }
}
