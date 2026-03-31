import { NextResponse } from 'next/server';

const BASE_URL = 'https://www.datasys360.com';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

const AJAX_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

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

// Session management
let sessionCookie: string | null = null;
let sessionTimestamp = 0;
const SESSION_TTL = 30 * 60 * 1000; // 30 min — re-login before PHP expires it

// Data cache
let dataCache: Datasys360Campaign[] = [];
let cacheTimestamp = 0;
let fetchInProgress = false;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCredentials() {
  return {
    username: process.env.DATASYS360_USERNAME || '',
    password: process.env.DATASYS360_PASSWORD || '',
  };
}

function extractSetCookie(response: Response): string | null {
  const raw = response.headers.get('set-cookie');
  if (!raw) return null;
  const match = raw.match(/PHPSESSID=([^;]+)/);
  return match ? `PHPSESSID=${match[1]}` : null;
}

async function login(): Promise<string> {
  const { username, password } = getCredentials();
  if (!username || !password) throw new Error('Datasys360 credentials not configured');

  const res = await fetch(`${BASE_URL}/System/ajax/login.php`, {
    method: 'POST',
    headers: {
      ...AJAX_HEADERS,
      'Referer': `${BASE_URL}/login.php`,
    },
    body: `Username=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`,
    redirect: 'manual',
  });

  const cookie = extractSetCookie(res);
  const body = await res.text();

  if (!body.includes('SUCCESS') && !cookie) {
    throw new Error('Datasys360 login failed');
  }

  if (cookie) {
    sessionCookie = cookie;
    sessionTimestamp = Date.now();
  }

  if (!sessionCookie) throw new Error('No session cookie received');
  return sessionCookie;
}

async function getSession(): Promise<string> {
  if (sessionCookie && (Date.now() - sessionTimestamp) < SESSION_TTL) {
    return sessionCookie;
  }
  return login();
}

async function fetchWithSession(url: string, headers: Record<string, string>, retryOnAuthFail = true): Promise<Response> {
  const cookie = await getSession();
  const res = await fetch(url, {
    headers: { ...headers, 'Cookie': cookie },
    redirect: 'manual',
  });

  const isRedirectToLogin = res.status === 302 || res.status === 301;
  const location = res.headers.get('location') || '';
  if (isRedirectToLogin && location.includes('login') && retryOnAuthFail) {
    sessionCookie = null;
    const newCookie = await login();
    return fetch(url, {
      headers: { ...headers, 'Cookie': newCookie },
      redirect: 'manual',
    });
  }

  return res;
}

async function fetchSocialCampaignList(): Promise<Array<{
  SocialCampaignID: number;
  CampaignName: string;
  AdvertiserName: string;
  StartDate: string;
  EndDate: string;
  Impressions: number;
  Frequency: number;
}>> {
  const now = new Date();
  const startDate = new Date(now.getFullYear() - 1, 0, 1);
  const sd = `${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}/${startDate.getFullYear()}`;
  const ed = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;

  const url = `${BASE_URL}/System/ajax/social_campaigns.php?_s=${encodeURIComponent(sd)}&_e=${encodeURIComponent(ed)}`;
  const res = await fetchWithSession(url, {
    ...AJAX_HEADERS,
    'Referer': `${BASE_URL}/campaign-social-dashboard.php`,
  });

  const json = await res.json();
  if (!json.data || !Array.isArray(json.data)) return [];
  return json.data;
}

function parseMetricFromHTML(html: string, label: string): number {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escapedLabel}[\\s\\S]*?<span[^>]*class="[^"]*browser-result[^"]*"[^>]*>\\s*([\\d,.]+)`,
    'i'
  );
  const match = html.match(pattern);
  if (match) return parseFloat(match[1].replace(/,/g, '')) || 0;

  const fallbackPattern = new RegExp(
    `${escapedLabel}[\\s\\S]{0,500}?>[\\s]*([\\d,]+(?:\\.\\d+)?)[\\s]*<`,
    'i'
  );
  const fallback = html.match(fallbackPattern);
  if (fallback) return parseFloat(fallback[1].replace(/,/g, '')) || 0;

  return 0;
}

function parsePercentFromHTML(html: string, label: string): number {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escapedLabel}[\\s\\S]*?<span[^>]*class="[^"]*browser-result[^"]*"[^>]*>\\s*([\\d,.]+)`,
    'i'
  );
  const match = html.match(pattern);
  if (match) return parseFloat(match[1]) || 0;

  const fallbackPattern = new RegExp(
    `${escapedLabel}[\\s\\S]{0,500}?>[\\s]*([\\d]+\\.\\d+)[\\s]*<`,
    'i'
  );
  const fallback = html.match(fallbackPattern);
  if (fallback) return parseFloat(fallback[1]) || 0;

  return 0;
}

async function scrapeCampaignStats(campaignId: number): Promise<{
  totalReach: number;
  totalImpressions: number;
  linkClicks: number;
  ctr: number;
  uniqueCtr: number;
  frequency: number;
} | null> {
  try {
    const url = `${BASE_URL}/tracking-report-social.php?cid=${campaignId}`;
    const res = await fetchWithSession(url, {
      ...BROWSER_HEADERS,
      'Referer': `${BASE_URL}/campaign-social-dashboard.php`,
    });

    const html = await res.text();

    if (html.length < 1000 || html.includes('<title>404') || html.includes('login.php')) {
      return null;
    }

    return {
      totalReach: parseMetricFromHTML(html, 'Total Reach'),
      totalImpressions: parseMetricFromHTML(html, 'Total Impressions'),
      linkClicks: parseMetricFromHTML(html, 'Link Clicks'),
      ctr: parsePercentFromHTML(html, 'CTR'),
      uniqueCtr: parsePercentFromHTML(html, 'Unique CTR'),
      frequency: parsePercentFromHTML(html, 'Frequency'),
    };
  } catch (e) {
    console.error(`Failed to scrape campaign ${campaignId}:`, e);
    return null;
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllData(): Promise<Datasys360Campaign[]> {
  const campaigns = await fetchSocialCampaignList();
  if (campaigns.length === 0) return [];

  const results: Datasys360Campaign[] = [];

  for (let i = 0; i < campaigns.length; i++) {
    const c = campaigns[i];
    const stats = await scrapeCampaignStats(c.SocialCampaignID);

    results.push({
      socialCampaignId: c.SocialCampaignID,
      campaignName: c.CampaignName,
      advertiserName: c.AdvertiserName,
      startDate: c.StartDate,
      endDate: c.EndDate,
      orderedImpressions: c.Impressions || 0,
      configuredFrequency: c.Frequency || 0,
      totalReach: stats?.totalReach || 0,
      totalImpressions: stats?.totalImpressions || 0,
      linkClicks: stats?.linkClicks || 0,
      ctr: stats?.ctr || 0,
      uniqueCtr: stats?.uniqueCtr || 0,
      frequency: stats?.frequency || 0,
    });

    if (i < campaigns.length - 1) {
      await delay(800 + Math.random() * 700);
    }
  }

  return results;
}

export async function GET(request: Request) {
  try {
    const { username, password } = getCredentials();
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Datasys360 credentials not configured', data: [] },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && dataCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
      return NextResponse.json({ data: dataCache, fromCache: true, fetchedAt: new Date(cacheTimestamp).toISOString() });
    }

    if (fetchInProgress) {
      if (dataCache.length > 0) {
        return NextResponse.json({ data: dataCache, fromCache: true, refreshing: true });
      }
      return NextResponse.json({ data: [], refreshing: true }, { status: 202 });
    }

    fetchInProgress = true;
    try {
      const records = await fetchAllData();
      dataCache = records;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: records, fetchedAt: new Date().toISOString() });
    } finally {
      fetchInProgress = false;
    }
  } catch (error) {
    if (dataCache.length > 0) {
      return NextResponse.json({ data: dataCache, fromCache: true, stale: true });
    }
    console.error('Error fetching Datasys360 data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Datasys360 data', message: error instanceof Error ? error.message : 'Unknown error', data: [] },
      { status: 500 }
    );
  }
}
