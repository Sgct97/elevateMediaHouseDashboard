'use client';

import { useState, useMemo } from 'react';
import type { GroundTruthCampaign } from '@/app/api/groundtruth/route';

interface GroundTruthSectionProps {
  data: GroundTruthCampaign[];
  loading: boolean;
  accentColor: string;
  searchQuery?: string;
}

export function GroundTruthSection({ data, loading, accentColor, searchQuery }: GroundTruthSectionProps) {
  const [sortKey, setSortKey] = useState<string>('impressions');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const filtered = useMemo(() => {
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(r => r.campaignName.toLowerCase().includes(q));
  }, [data, searchQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = a[sortKey as keyof GroundTruthCampaign];
      const bVal = b[sortKey as keyof GroundTruthCampaign];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal || '').localeCompare(String(bVal || ''))
        : String(bVal || '').localeCompare(String(aVal || ''));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize);

  const totals = useMemo(() => {
    const t = { impressions: 0, reach: 0, clicks: 0 };
    for (const r of filtered) {
      t.impressions += r.impressions;
      t.reach += r.reach;
      t.clicks += r.clicks;
    }
    return {
      ...t,
      ctr: t.impressions > 0 ? +((t.clicks / t.impressions) * 100).toFixed(2) : 0,
    };
  }, [filtered]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: string) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Geofence Campaign</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">Loading geofence data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Geofence Campaign</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">No geofence data available.</div>
      </div>
    );
  }

  const columns: { key: string; label: string; align: 'left' | 'right'; render: (r: GroundTruthCampaign) => string }[] = [
    { key: 'campaignName', label: 'Campaign', align: 'left', render: r => r.campaignName },
    { key: 'impressions', label: 'Impressions', align: 'right', render: r => r.impressions.toLocaleString() },
    { key: 'reach', label: 'Reach', align: 'right', render: r => r.reach.toLocaleString() },
    { key: 'clicks', label: 'Clicks', align: 'right', render: r => r.clicks.toLocaleString() },
    { key: 'ctr', label: 'CTR', align: 'right', render: r => `${r.ctr.toFixed(2)}%` },
  ];

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Geofence Campaign</h2>
        <div className="flex items-center gap-4 text-xs text-[#718096]">
          <span>Impressions: <strong className="text-[#2D3748]">{totals.impressions.toLocaleString()}</strong></span>
          <span>Reach: <strong className="text-[#2D3748]">{totals.reach.toLocaleString()}</strong></span>
          <span>Clicks: <strong className="text-[#2D3748]">{totals.clicks.toLocaleString()}</strong></span>
          <span>CTR: <strong className="text-[#2D3748]">{totals.ctr}%</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-[#F8FAFB] border-b border-[#E2E8F0]">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-${col.align} text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr
                key={row.campaignId}
                className={`border-b border-[#F0F3F5] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-[#F0F4FF] transition-colors`}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-[#4A5568] ${col.align === 'right' ? 'text-right' : ''} whitespace-nowrap`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-[#A0AEC0]">
                  No data matches the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#718096]">
          <span>
            Showing {clampedPage * pageSize + 1}–{Math.min((clampedPage + 1) * pageSize, sorted.length)} of {sorted.length} campaigns
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="px-2 py-1 border border-[#E2E8F0] disabled:opacity-40 hover:bg-[#F8FAFB] transition-colors"
            >
              ←
            </button>
            <span className="px-2">Page {clampedPage + 1} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage >= totalPages - 1}
              className="px-2 py-1 border border-[#E2E8F0] disabled:opacity-40 hover:bg-[#F8FAFB] transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
