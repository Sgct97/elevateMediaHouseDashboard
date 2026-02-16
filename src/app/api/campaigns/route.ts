import { NextResponse } from 'next/server';

const API_BASE_URL = 'http://www.worthautotrack.com/api/v1';

// In-memory cache — keyed by campaign ID so we can merge incrementally
const campaignCache = new Map<string, unknown>();
const urlBreakdownCache = new Map<string, { campaignId: string; urls: unknown[] }>();
let cacheReady = false;
let fetchInProgress = false; // Prevent concurrent fetches from overlapping

function getAuthHeader(): string | null {
  const username = process.env.WORTHAUTOTRACK_USERNAME;
  const password = process.env.WORTHAUTOTRACK_PASSWORD;
  
  if (!username || !password) return null;
  
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout per request
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

// Fetch stats for a batch of campaign IDs and merge into cache
async function fetchCampaignBatch(ids: string[], authHeader: string) {
  const batchSize = 5;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (campaignId) => {
        try {
          const response = await fetchWithRetry(
            `${API_BASE_URL}/campaign/viewstats/${campaignId}`,
            { method: 'POST', headers: { 'Authorization': authHeader } },
            3
          );
          if (!response.ok) return null;

          const data = await response.json();
          return {
            campaignId,
            stats: data.Data,
            urls: data.Data?.['URL Breakdown'] || [],
          };
        } catch {
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (result && result.stats) {
        campaignCache.set(result.campaignId, result.stats);
        if (result.urls && result.urls.length > 0) {
          urlBreakdownCache.set(result.campaignId, {
            campaignId: result.campaignId,
            urls: result.urls,
          });
        }
      }
    }

    if (i + batchSize < ids.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

function buildResponse(extras: Record<string, unknown> = {}) {
  return {
    campaigns: Array.from(campaignCache.values()),
    urlBreakdowns: Array.from(urlBreakdownCache.values()),
    totalCampaigns: campaignCache.size,
    fetchedCampaigns: campaignCache.size,
    fetchedAt: new Date().toISOString(),
    ...extras,
  };
}

export async function GET(request: Request) {
  try {
    const authHeader = getAuthHeader();

    if (!authHeader) {
      return NextResponse.json(
        {
          error: 'API credentials not configured',
          message: 'Set WORTHAUTOTRACK_USERNAME and WORTHAUTOTRACK_PASSWORD in your environment variables.',
          campaigns: [],
          urlBreakdowns: [],
        },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    // If cache exists and not a forced refresh, return it immediately
    if (!forceRefresh && cacheReady && campaignCache.size > 0) {
      return NextResponse.json(buildResponse({ fromCache: true }));
    }

    // If another fetch is already running, return cached data (or loading state)
    if (fetchInProgress) {
      if (campaignCache.size > 0) {
        return NextResponse.json(buildResponse({ fromCache: true, refreshing: true }));
      }
      return NextResponse.json(
        { error: 'Initial data load in progress. Please wait and refresh.', campaigns: [], urlBreakdowns: [] },
        { status: 202 }
      );
    }

    fetchInProgress = true;

    try {
      // Get the full list of campaign IDs from the API
      const allCampaignsResponse = await fetchWithRetry(`${API_BASE_URL}/campaigns/all/`, {
        headers: { 'Authorization': authHeader },
      });

      if (!allCampaignsResponse.ok) {
        if (allCampaignsResponse.status === 401) {
          return NextResponse.json(
            { error: 'Authentication failed. Check your API credentials.' },
            { status: 401 }
          );
        }
        throw new Error(`API returned ${allCampaignsResponse.status}`);
      }

      const allCampaignsData = await allCampaignsResponse.json();
      const allIds: string[] = allCampaignsData.Data.map(
        (c: { 'Campaign ID': number }) => String(c['Campaign ID'])
      );

      // Figure out which IDs we DON'T already have cached
      const missingIds = allIds.filter(id => !campaignCache.has(id));

      // Only fetch what's missing
      if (missingIds.length > 0) {
        await fetchCampaignBatch(missingIds, authHeader);
      }

      cacheReady = true;
      return NextResponse.json(buildResponse());

    } finally {
      fetchInProgress = false;
    }

  } catch (error) {
    // If fetch fails but we have cached data, return it (stale is better than nothing)
    if (campaignCache.size > 0) {
      return NextResponse.json(buildResponse({ fromCache: true, stale: true }));
    }

    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch data from WorthAutoTrack API',
        message: error instanceof Error ? error.message : 'Unknown error',
        campaigns: [],
        urlBreakdowns: [],
      },
      { status: 500 }
    );
  }
}
