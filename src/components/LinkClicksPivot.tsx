'use client';

import { useState, useMemo } from 'react';

interface Campaign {
  'Campaign ID': number | string;
  'Invoice #': string;
  'Campaign Title': string;
  'Launch Date': string | null;
  'Create Date': string | null;
  'URL Breakdown'?: Array<{
    URLID: number;
    Clicks: number;
    'Unique Clicks': number;
    URL: string;
  }>;
  [key: string]: unknown;
}

interface LinkClicksPivotProps {
  campaigns: Campaign[];
  loading: boolean;
  accentColor?: string;
  invoices: string[];
  selectedInvoice: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

export function LinkClicksPivot({
  campaigns,
  loading,
  accentColor = '#4BA5A5',
  invoices,
  selectedInvoice,
}: LinkClicksPivotProps) {
  const [pivotInvoice, setPivotInvoice] = useState(selectedInvoice || '');

  // When the global filter changes, sync
  const activeInvoice = selectedInvoice || pivotInvoice;

  // Get all drops (Campaign IDs) for the selected invoice, sorted by launch date
  const drops = useMemo(() => {
    if (!activeInvoice) return [];
    return campaigns
      .filter(c => c['Invoice #'] === activeInvoice)
      .sort((a, b) => {
        const aDate = new Date(a['Launch Date'] || a['Create Date'] || '');
        const bDate = new Date(b['Launch Date'] || b['Create Date'] || '');
        return aDate.getTime() - bDate.getTime();
      });
  }, [campaigns, activeInvoice]);

  // Build pivot data: rows = Link IDs, columns = drops (keyed by campaign ID to avoid duplicates)
  const { pivotRows, linkIds } = useMemo(() => {
    if (!drops.length) return { pivotRows: [], linkIds: [] };

    // Collect all Link IDs across all drops
    const allLinkIds = new Set<number>();
    const dropData: Array<{ campaignId: string; date: string; clicksByLink: Map<number, number> }> = [];

    for (const drop of drops) {
      const urls = drop['URL Breakdown'] || [];
      const clicksByLink = new Map<number, number>();
      for (const url of urls) {
        allLinkIds.add(url.URLID);
        clicksByLink.set(url.URLID, url.Clicks);
      }
      dropData.push({
        campaignId: String(drop['Campaign ID']),
        date: drop['Launch Date'] || drop['Create Date'] || '',
        clicksByLink,
      });
    }

    const sortedLinkIds = Array.from(allLinkIds).sort((a, b) => a - b);

    // Use campaignId as key (unique) instead of date (could duplicate)
    const rows = sortedLinkIds.map(linkId => {
      const row: Record<string, unknown> = { 'Link ID': linkId };
      for (const dd of dropData) {
        row[`drop_${dd.campaignId}`] = dd.clicksByLink.get(linkId) ?? 0;
      }
      return row;
    });

    return { pivotRows: rows, linkIds: sortedLinkIds };
  }, [drops]);

  // Column headers for the drop dates
  const dropColumns = useMemo(() => {
    return drops.map(d => ({
      date: formatDate(d['Launch Date'] || d['Create Date'] || ''),
      campaignId: String(d['Campaign ID']),
    }));
  }, [drops]);

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-light text-[#2D3748]">Link Clicks Summary</h2>
        </div>
        <div className="p-12 text-center text-sm text-[#A0AEC0]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-light text-[#2D3748]">Link Clicks Summary</h2>
          <div className="w-8 h-0.5" style={{ backgroundColor: accentColor }} />
        </div>

        {/* Invoice selector for pivot (only shows if global filter isn't set) */}
        {!selectedInvoice && (
          <select
            value={pivotInvoice}
            onChange={(e) => setPivotInvoice(e.target.value)}
            className="px-4 py-2 text-sm border-2 bg-white min-w-[160px] focus:outline-none"
            style={{ borderColor: accentColor, color: accentColor }}
          >
            <option value="">Select Invoice #</option>
            {invoices.map((inv) => (
              <option key={inv} value={inv}>{inv}</option>
            ))}
          </select>
        )}
      </div>

      {!activeInvoice ? (
        <div className="p-12 text-center text-sm text-[#A0AEC0]">
          Select an Invoice # to view link click data by drop.
        </div>
      ) : drops.length === 0 ? (
        <div className="p-12 text-center text-sm text-[#A0AEC0]">
          No campaigns found for invoice {activeInvoice}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Campaign info header */}
          <div className="px-6 py-3 bg-[#FAFBFC] border-b border-[#E2E8F0] text-sm text-[#718096]">
            <span className="font-medium text-[#2D3748]">{drops[0]?.['Campaign Title']}</span>
            <span className="ml-3">•</span>
            <span className="ml-3">Invoice: {activeInvoice}</span>
            <span className="ml-3">•</span>
            <span className="ml-3">{drops.length} drop{drops.length !== 1 ? 's' : ''}</span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#718096] uppercase tracking-wider">
                  Link ID
                </th>
                {dropColumns.map((col, i) => (
                  <th
                    key={i}
                    className="px-6 py-3 text-right text-xs font-semibold text-[#718096] uppercase tracking-wider"
                  >
                    <div>Clicks {col.date}</div>
                    <div className="text-[10px] font-normal text-[#A0AEC0] normal-case">
                      Drop {col.campaignId}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivotRows.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-[#F7FAFC] transition-colors hover:bg-[#FAFBFC] ${
                    i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'
                  }`}
                >
                  <td className="px-6 py-3 text-sm text-[#2D3748] font-medium">
                    {row['Link ID'] as number}
                  </td>
                  {dropColumns.map((col, j) => (
                    <td key={j} className="px-6 py-3 text-sm text-[#2D3748] text-right">
                      {((row[`drop_${col.campaignId}`] as number) || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

