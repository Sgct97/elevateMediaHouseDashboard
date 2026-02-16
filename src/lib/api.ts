// WorthAutoTrack API Client
// Ready to connect when credentials are provided

const API_BASE_URL = 'http://www.worthautotrack.com/api/v1';

// Set these in environment variables
const getAuthHeader = () => {
  const username = process.env.WORTHAUTOTRACK_USERNAME;
  const password = process.env.WORTHAUTOTRACK_PASSWORD;
  
  if (!username || !password) {
    throw new Error('API credentials not configured. Set WORTHAUTOTRACK_USERNAME and WORTHAUTOTRACK_PASSWORD environment variables.');
  }
  
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
};

export interface Campaign {
  'Campaign ID': string;
  'Campaign Title': string;
  'Create Date': string;
}

export interface CampaignStats {
  'Campaign ID': string;
  'Invoice #': string;
  'Campaign Title': string;
  'Create Date': string;
  'Launch Date': string | null;
  'Total Emails': string;
  'Total Opens': number;
  'Opens Rate': string;
  'Unique Opens': number;
  'Unique Opens Rate': string;
  'Total Clicks': number;
  'Click Thru Rate': string;
  'Desktop Clicks': number;
  'Mobile Clicks': number;
  'Unique Clicks': number;
  'Unique Click Thru Rate': string;
  'Clicks to Opens Rate': string;
  'Unique Clicks to Opens Rate': string;
}

export interface URLBreakdown {
  URLID: number;
  Type: string;
  Clicks: number;
  'Unique Clicks': number;
  URL: string;
}

export interface CampaignWithURLs extends CampaignStats {
  'URL Breakdown': URLBreakdown[];
}

export interface APIResponse<T> {
  Status: number;
  DataCount: number;
  DataSize: number;
  Data: T;
  Cache?: number;
}

// GET campaigns/all/ - Get all campaigns (basic info)
export async function getAllCampaigns(): Promise<Campaign[]> {
  const response = await fetch(`${API_BASE_URL}/campaigns/all/`, {
    headers: {
      'Authorization': getAuthHeader(),
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data: APIResponse<Campaign[]> = await response.json();
  return data.Data;
}

// GET campaigns/recent/ - Get recent campaigns with full stats
export async function getRecentCampaigns(): Promise<CampaignStats[]> {
  const response = await fetch(`${API_BASE_URL}/campaigns/recent/`, {
    headers: {
      'Authorization': getAuthHeader(),
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data: APIResponse<CampaignStats[]> = await response.json();
  return data.Data;
}

// POST campaign/viewstats/:id - Get single campaign with URL breakdown
export async function getCampaignStats(campaignId: string): Promise<CampaignWithURLs> {
  const response = await fetch(`${API_BASE_URL}/campaign/viewstats/${campaignId}`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data: APIResponse<CampaignWithURLs> = await response.json();
  return data.Data;
}

// Fetch all campaign stats (calls viewstats for each campaign)
export async function getAllCampaignStats(): Promise<CampaignWithURLs[]> {
  const campaigns = await getAllCampaigns();
  
  const statsPromises = campaigns.map(campaign => 
    getCampaignStats(campaign['Campaign ID'])
  );
  
  return Promise.all(statsPromises);
}

// Calculate dashboard aggregates
export function calculateAggregates(campaigns: CampaignStats[]) {
  const totalCampaigns = campaigns.length;
  const totalOpens = campaigns.reduce((sum, c) => sum + c['Total Opens'], 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + c['Total Clicks'], 0);
  const totalEmails = campaigns.reduce((sum, c) => sum + parseInt(c['Total Emails'] || '0'), 0);
  
  const avgOpenRate = totalEmails > 0 ? (totalOpens / totalEmails) * 100 : 0;
  const avgClickRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;

  return {
    totalCampaigns,
    totalOpens,
    totalClicks,
    totalEmails,
    avgOpenRate,
    avgClickRate,
  };
}

