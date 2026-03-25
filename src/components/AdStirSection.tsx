'use client';

import { useState, useMemo } from 'react';
import type { AdStirRecord } from '@/app/api/adstir/route';

interface AdStirSectionProps {
  data: AdStirRecord[];
  loading: boolean;
  accentColor: string;
  dateRange?: { start: string; end: string };
}

export function AdStirSection({ data, loading, accentColor, dateRange }: AdStirSectionProps) {
  const [selectedAdvertiser, setSelectedAdvertiser] = useState('');
  const [showClicks, setShowClicks] = useState(true);
  const [showVCR, setShowVCR] = useState(true);
  const [costInput, setCostInput] = useState('');
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const advertisers = useMemo(() => {
    const unique = new Set(data.map(r => r.advertiser).filter(Boolean));
    return Array.from(unique).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (dateRange?.start || dateRange?.end) {
      result = result.filter(r => {
        const recordDate = r.date;
        if (!recordDate) return false;
        if (dateRange.start && recordDate < dateRange.start) return false;
        if (dateRange.end && recordDate > dateRange.end) return false;
        return true;
      });
    }
    if (selectedAdvertiser) {
      result = result.filter(r => r.advertiser === selectedAdvertiser);
    }
    return result;
  }, [data, selectedAdvertiser, dateRange]);

  const aggregated = useMemo(() => {
    const byKey = new Map<string, {
      advertiser: string;
      campaign: string;
      campaignId: string;
      impressions: number;
      uniqueImpressions: number;
      completedViews: number;
      clicks: number;
      days: number;
    }>();

    for (const r of filtered) {
      const key = r.campaignId;
      const existing = byKey.get(key);
      if (existing) {
        existing.impressions += r.impressions;
        existing.uniqueImpressions += r.uniqueImpressions;
        existing.completedViews += r.completedViews;
        existing.clicks += r.clicks;
        existing.days += 1;
      } else {
        byKey.set(key, {
          advertiser: r.advertiser,
          campaign: r.campaign,
          campaignId: r.campaignId,
          impressions: r.impressions,
          uniqueImpressions: r.uniqueImpressions,
          completedViews: r.completedViews,
          clicks: r.clicks,
          days: 1,
        });
      }
    }

    return Array.from(byKey.values()).map(row => ({
      ...row,
      reach: row.uniqueImpressions,
      frequency: row.uniqueImpressions > 0 ? +(row.impressions / row.uniqueImpressions).toFixed(2) : 0,
      vcr: row.impressions > 0 ? +(row.completedViews / row.impressions * 100).toFixed(2) : 0,
    }));
  }, [filtered]);

  const totals = useMemo(() => {
    const t = {
      impressions: 0,
      reach: 0,
      frequency: 0,
      completedViews: 0,
      vcr: 0,
      clicks: 0,
    };
    for (const row of aggregated) {
      t.impressions += row.impressions;
      t.reach += row.reach;
      t.completedViews += row.completedViews;
      t.clicks += row.clicks;
    }
    t.frequency = t.reach > 0 ? +(t.impressions / t.reach).toFixed(2) : 0;
    t.vcr = t.impressions > 0 ? +(t.completedViews / t.impressions * 100).toFixed(2) : 0;
    return t;
  }, [aggregated]);

  const cpcv = useMemo(() => {
    const cost = parseFloat(costInput);
    if (isNaN(cost) || cost <= 0 || totals.completedViews === 0) return null;
    return (cost / totals.completedViews).toFixed(4);
  }, [costInput, totals.completedViews]);

  const sorted = useMemo(() => {
    const arr = [...aggregated];
    arr.sort((a, b) => {
      const aVal = a[sortKey as keyof typeof a];
      const bVal = b[sortKey as keyof typeof b];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal || '');
      const bStr = String(bVal || '');
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return arr;
  }, [aggregated, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize);

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
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">
            AdStir Retargeting Performance
          </h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">Loading retargeting data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">
            AdStir Retargeting Performance
          </h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">No retargeting data available.</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0]">
      {/* Header with CPCV Calculator and Advertiser Picker */}
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">
          AdStir Retargeting Performance
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          {/* CPCV Calculator */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide">CPCV</span>
            <span className="text-xs text-[#718096]">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="Cost"
              className="text-xs border border-[#E2E8F0] px-2 py-1.5 w-24 text-[#2D3748] bg-white"
            />
            <span className="text-xs text-[#718096]">÷ {totals.completedViews.toLocaleString()} views =</span>
            <span className="text-sm font-semibold" style={{ color: cpcv ? accentColor : '#A0AEC0' }}>
              {cpcv ? `$${cpcv}` : '—'}
            </span>
          </div>
          {/* Advertiser filter */}
          <select
            value={selectedAdvertiser}
            onChange={(e) => { setSelectedAdvertiser(e.target.value); setPage(0); }}
            className="text-xs border border-[#E2E8F0] px-2 py-1.5 text-[#4A5568] bg-white min-w-[180px]"
          >
            <option value="">All Advertisers</option>
            {advertisers.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {/* VCR toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[#718096] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showVCR}
              onChange={(e) => setShowVCR(e.target.checked)}
              className="accent-current"
              style={{ accentColor: accentColor }}
            />
            Show VCR
          </label>
          {/* Clicks toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[#718096] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showClicks}
              onChange={(e) => setShowClicks(e.target.checked)}
              className="accent-current"
              style={{ accentColor: accentColor }}
            />
            Show Clicks
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-[#F8FAFB] border-b border-[#E2E8F0]">
              <th
                className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('advertiser')}
              >
                Advertiser{sortIndicator('advertiser')}
              </th>
              <th
                className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('campaign')}
              >
                Campaign{sortIndicator('campaign')}
              </th>
              <th
                className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('impressions')}
              >
                Impressions{sortIndicator('impressions')}
              </th>
              <th
                className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('reach')}
              >
                Reach{sortIndicator('reach')}
              </th>
              <th
                className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('frequency')}
              >
                Frequency{sortIndicator('frequency')}
              </th>
              {showVCR && (
                <th
                  className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                  onClick={() => handleSort('vcr')}
                >
                  VCR{sortIndicator('vcr')}
                </th>
              )}
              {showClicks && (
                <th
                  className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                  onClick={() => handleSort('clicks')}
                >
                  Clicks{sortIndicator('clicks')}
                </th>
              )}
              {cpcv && (
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] whitespace-nowrap">
                  CPCV
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr
                key={row.campaignId}
                className={`border-b border-[#F0F3F5] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-[#F0F4FF] transition-colors`}
              >
                <td className="px-4 py-2.5 text-[#4A5568] whitespace-nowrap">{row.advertiser}</td>
                <td className="px-4 py-2.5 text-[#4A5568]">{row.campaign}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568]">{row.impressions.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568]">{row.reach.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-[#4A5568]">{row.frequency}</td>
                {showVCR && (
                  <td className="px-4 py-2.5 text-right text-[#4A5568]">{row.vcr}%</td>
                )}
                {showClicks && (
                  <td className="px-4 py-2.5 text-right text-[#4A5568]">{row.clicks.toLocaleString()}</td>
                )}
                {cpcv && (
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: row.completedViews > 0 ? accentColor : '#A0AEC0' }}>
                    {row.completedViews > 0 ? `$${cpcv}` : '—'}
                  </td>
                )}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5 + (showVCR ? 1 : 0) + (showClicks ? 1 : 0) + (cpcv ? 1 : 0)} className="px-4 py-8 text-center text-[#A0AEC0]">
                  No data matches the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
            <span className="px-2">
              Page {clampedPage + 1} of {totalPages}
            </span>
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
