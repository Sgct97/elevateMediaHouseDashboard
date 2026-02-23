import { NextResponse } from 'next/server';

// Server-side store — persists across all users/sessions until server restarts
const hiddenCampaignIds = new Set<string>();

// GET — return current hidden IDs
export async function GET() {
  return NextResponse.json({ hiddenIds: Array.from(hiddenCampaignIds) });
}

// POST — hide, unhide, or unhide all
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, campaignId } = body;

    if (action === 'hide' && campaignId) {
      hiddenCampaignIds.add(String(campaignId));
    } else if (action === 'unhide' && campaignId) {
      hiddenCampaignIds.delete(String(campaignId));
    } else if (action === 'unhideAll') {
      hiddenCampaignIds.clear();
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ hiddenIds: Array.from(hiddenCampaignIds) });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

