'use client';

import { useMemo, useState } from 'react';

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
  onHideDrop?: (campaignId: string) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

interface InvoiceGroup {
  invoice: string;
  title: string;
  drops: Campaign[];
  dropColumns: Array<{ date: string; campaignId: string }>;
  pivotRows: Array<Record<string, unknown>>;
}

export function LinkClicksPivot({
  campaigns,
  loading,
  accentColor = '#4BA5A5',
  onHideDrop,
}: LinkClicksPivotProps) {
  const PAGE_SIZE = 5;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Group campaigns by Invoice #, build pivot for each
  const invoiceGroups: InvoiceGroup[] = useMemo(() => {
    if (!campaigns.length) return [];

    // Group by invoice
    const grouped = new Map<string, Campaign[]>();
    for (const c of campaigns) {
      const inv = c['Invoice #'];
      if (!inv) continue;
      if (!grouped.has(inv)) grouped.set(inv, []);
      grouped.get(inv)!.push(c);
    }

    const groups: InvoiceGroup[] = [];

    for (const [invoice, camps] of grouped) {
      // Sort drops by launch date (chronological)
      const sorted = [...camps].sort((a, b) => {
        const aDate = new Date(a['Launch Date'] || a['Create Date'] || '');
        const bDate = new Date(b['Launch Date'] || b['Create Date'] || '');
        return aDate.getTime() - bDate.getTime();
      });

      // Build drop columns
      const dropColumns = sorted.map(d => ({
        date: formatDate(d['Launch Date'] || d['Create Date'] || ''),
        campaignId: String(d['Campaign ID']),
      }));

      // Collect all Link IDs and click data
      const allLinkIds = new Set<number>();
      const dropData: Array<{ campaignId: string; clicksByLink: Map<number, number> }> = [];

      for (const drop of sorted) {
        const urls = drop['URL Breakdown'] || [];
        const clicksByLink = new Map<number, number>();
        for (const url of urls) {
          allLinkIds.add(url.URLID);
          clicksByLink.set(url.URLID, url.Clicks);
        }
        dropData.push({ campaignId: String(drop['Campaign ID']), clicksByLink });
      }

      const sortedLinkIds = Array.from(allLinkIds).sort((a, b) => a - b);

      const pivotRows = sortedLinkIds.map(linkId => {
        const row: Record<string, unknown> = { 'Link ID': linkId };
        for (const dd of dropData) {
          row[`drop_${dd.campaignId}`] = dd.clicksByLink.get(linkId) ?? 0;
        }
        return row;
      });

      groups.push({
        invoice,
        title: sorted[0]?.['Campaign Title'] || '',
        drops: sorted,
        dropColumns,
        pivotRows,
      });
    }

    // Sort invoice groups by most recent launch date (newest first)
    groups.sort((a, b) => {
      const aLatest = a.drops[a.drops.length - 1];
      const bLatest = b.drops[b.drops.length - 1];
      const aDate = new Date(aLatest?.['Launch Date'] || aLatest?.['Create Date'] || '');
      const bDate = new Date(bLatest?.['Launch Date'] || bLatest?.['Create Date'] || '');
      return bDate.getTime() - aDate.getTime();
    });

    return groups;
  }, [campaigns]);

  const visibleGroups = invoiceGroups.slice(0, visibleCount);
  const hasMore = visibleCount < invoiceGroups.length;

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

  if (invoiceGroups.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-light text-[#2D3748]">Link Clicks Summary</h2>
        </div>
        <div className="p-12 text-center text-sm text-[#A0AEC0]">No link click data available.</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
        <h2 className="text-lg font-light text-[#2D3748]">Link Clicks Summary</h2>
        <div className="w-8 h-0.5" style={{ backgroundColor: accentColor }} />
        <span className="text-xs text-[#A0AEC0] ml-auto">
          {invoiceGroups.length} invoice{invoiceGroups.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-[#E2E8F0]">
        {visibleGroups.map((group) => (
          <div key={group.invoice}>
            {/* Invoice group header */}
            <div className="px-6 py-3 bg-[#FAFBFC] border-b border-[#E2E8F0] text-sm text-[#718096]">
              <span className="font-medium text-[#2D3748]">{group.title}</span>
              <span className="ml-3">•</span>
              <span className="ml-3">Invoice: {group.invoice}</span>
              <span className="ml-3">•</span>
              <span className="ml-3">{group.drops.length} drop{group.drops.length !== 1 ? 's' : ''}</span>
            </div>

            {group.pivotRows.length === 0 ? (
              <div className="px-6 py-4 text-sm text-[#A0AEC0]">No URL data for this invoice.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0]">
                      <th className="w-20 px-4 py-3 text-left text-xs font-semibold text-[#718096] uppercase tracking-wider">
                        Link ID
                      </th>
                      {group.dropColumns.map((col, i) => (
                        <th
                          key={i}
                          className="px-6 py-3 text-right text-xs font-semibold text-[#718096] uppercase tracking-wider group/col"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Clicks {col.date}</span>
                            {onHideDrop && (
                              <button
                                onClick={() => onHideDrop(col.campaignId)}
                                className="opacity-0 group-hover/col:opacity-100 text-[#CBD5E0] hover:text-[#E53E3E] transition-all text-[10px] ml-1"
                                title={`Hide drop ${col.campaignId}`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] font-normal text-[#A0AEC0] normal-case">
                            Drop {col.campaignId}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.pivotRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-[#F7FAFC] transition-colors hover:bg-[#FAFBFC] ${
                          i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'
                        }`}
                      >
                        <td className="w-20 px-4 py-3 text-sm text-[#2D3748] font-medium">
                          {row['Link ID'] as number}
                        </td>
                        {group.dropColumns.map((col, j) => (
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
        ))}
      </div>

      {/* Show more / show less */}
      {invoiceGroups.length > PAGE_SIZE && (
        <div className="px-6 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-sm text-[#718096]">
          <span>
            Showing {visibleGroups.length} of {invoiceGroups.length} invoices
          </span>
          <div className="flex gap-2">
            {hasMore && (
              <button
                onClick={() => setVisibleCount(v => Math.min(v + PAGE_SIZE, invoiceGroups.length))}
                className="px-3 py-1 border border-[#E2E8F0] hover:bg-[#F8FAFB] transition-colors"
              >
                Show more
              </button>
            )}
            {visibleCount > PAGE_SIZE && (
              <button
                onClick={() => setVisibleCount(PAGE_SIZE)}
                className="px-3 py-1 border border-[#E2E8F0] hover:bg-[#F8FAFB] transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
