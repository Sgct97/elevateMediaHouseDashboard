'use client';

import { useState, useMemo } from 'react';
import type { PacingRecord } from '@/app/api/pacing/route';

interface PacingReportProps {
  data: PacingRecord[];
  loading: boolean;
  accentColor: string;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  return new Date(y, m - 1, d);
}

function daysRemaining(flightEnd: string): number | null {
  const end = parseDate(flightEnd);
  if (!end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = end.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function pacingColor(pct: number): string {
  if (pct >= 70) return '#38A169';
  if (pct >= 40) return '#D69E2E';
  return '#E53E3E';
}

function pacingBg(pct: number): string {
  if (pct >= 70) return '#F0FFF4';
  if (pct >= 40) return '#FFFFF0';
  return '#FFF5F5';
}

function formatBudget(val: number, isDollar: boolean): string {
  if (isDollar) {
    return '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return val.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PacingReport({ data, loading, accentColor }: PacingReportProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('pacingPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.advertiser.toLowerCase().includes(q) ||
      r.campaignName.toLowerCase().includes(q)
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    const arr = filtered.map(r => ({
      ...r,
      daysRemaining: daysRemaining(r.flightEndDate),
    }));

    arr.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortKey === 'daysRemaining') {
        aVal = a.daysRemaining ?? -9999;
        bVal = b.daysRemaining ?? -9999;
      } else if (sortKey === 'flightStartDate' || sortKey === 'flightEndDate') {
        aVal = parseDate(a[sortKey])?.getTime() ?? 0;
        bVal = parseDate(b[sortKey])?.getTime() ?? 0;
      } else if (sortKey === 'advertiser' || sortKey === 'campaignName' || sortKey === 'creativeType') {
        aVal = a[sortKey] || '';
        bVal = b[sortKey] || '';
      } else {
        aVal = (a as Record<string, unknown>)[sortKey] as number ?? 0;
        bVal = (b as Record<string, unknown>)[sortKey] as number ?? 0;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'advertiser' || key === 'campaignName' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  const sortIndicator = (key: string) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const thClass = "px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568] select-none";

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Campaign Pacing Report</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">Loading pacing data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Campaign Pacing Report</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">No pacing data available. Waiting for data in pacing-reports/ folder.</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded">
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">
          Campaign Pacing Report
        </h2>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search client or campaign..."
            className="px-3 py-1.5 text-sm border-2 bg-white min-w-[240px] focus:outline-none"
            style={{ borderColor: accentColor }}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(0); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#2D3748] text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-[#F8FAFB] border-b border-[#E2E8F0]">
              <th className={`${thClass} text-left`} onClick={() => handleSort('advertiser')}>
                Advertiser{sortIndicator('advertiser')}
              </th>
              <th className={`${thClass} text-left`} onClick={() => handleSort('campaignName')}>
                Campaign{sortIndicator('campaignName')}
              </th>
              <th className={`${thClass} text-center`} onClick={() => handleSort('creativeType')}>
                Type{sortIndicator('creativeType')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('flightStartDate')}>
                Flight Start{sortIndicator('flightStartDate')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('flightEndDate')}>
                Flight End{sortIndicator('flightEndDate')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('daysRemaining')}>
                Days Left{sortIndicator('daysRemaining')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('orderedBudget')}>
                Ordered{sortIndicator('orderedBudget')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('deliveredBudget')}>
                Delivered{sortIndicator('deliveredBudget')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('deliveryPct')}>
                Delivery %{sortIndicator('deliveryPct')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('pacingPct')}>
                Pacing %{sortIndicator('pacingPct')}
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('yesterdayDeliveryPct')}>
                Yesterday %{sortIndicator('yesterdayDeliveryPct')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => {
              const days = row.daysRemaining;
              const isExpired = days !== null && days <= 0;
              return (
                <tr
                  key={`${row.campaignId}-${i}`}
                  className={`border-b border-[#F0F3F5] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-[#F0F4FF] transition-colors`}
                >
                  <td className="px-3 py-2 text-[#4A5568] whitespace-nowrap max-w-[200px] truncate" title={row.advertiser}>
                    {row.advertiser}
                  </td>
                  <td className="px-3 py-2 text-[#4A5568] max-w-[260px] truncate" title={row.campaignName}>
                    {row.campaignName}
                  </td>
                  <td className="px-3 py-2 text-center text-[#718096]">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full ${
                      row.creativeType === 'Video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {row.creativeType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[#718096] whitespace-nowrap text-xs">
                    {formatDate(row.flightStartDate)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#718096] whitespace-nowrap text-xs">
                    {formatDate(row.flightEndDate)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-xs">
                    {days !== null ? (
                      <span className={isExpired ? 'text-[#A0AEC0]' : days <= 5 ? 'text-[#E53E3E]' : 'text-[#4A5568]'}>
                        {isExpired ? 'Ended' : `${days}d`}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A5568] whitespace-nowrap">
                    {formatBudget(row.orderedBudget, row.budgetIsDollar)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A5568] whitespace-nowrap">
                    {formatBudget(row.deliveredBudget, row.budgetIsDollar)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A5568]">
                    {row.deliveryPct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        color: pacingColor(row.pacingPct),
                        backgroundColor: pacingBg(row.pacingPct),
                      }}
                    >
                      {row.pacingPct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A5568]">
                    {row.yesterdayDeliveryPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-[#A0AEC0]">
                  No campaigns match your search.
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

      <div className="px-4 py-2 border-t border-[#E2E8F0] flex items-center gap-4 text-[10px] text-[#A0AEC0]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#38A169' }} /> 70–100% On Track
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#D69E2E' }} /> 40–69% Needs Attention
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#E53E3E' }} /> Below 40% Critical
        </span>
      </div>
    </div>
  );
}
