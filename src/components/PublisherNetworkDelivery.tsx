'use client';

import { useMemo, useState } from 'react';
import type { CampaignDelivery } from '@/app/api/adstir-delivery/route';

interface Props {
  campaigns: CampaignDelivery[];
  selectedCampaign: string;
  accentColor: string;
  loading: boolean;
  reachByCampaign?: Map<string, number>;
}

type SortKey = 'publisher' | 'impressions' | 'completedViews' | 'completedViewsPct' | 'clicks';
type SortDir = 'asc' | 'desc';

export function PublisherNetworkDelivery({ campaigns, selectedCampaign, accentColor, loading, reachByCampaign }: Props) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState<'20' | '50' | '100' | 'all'>('50');
  const [sortKey, setSortKey] = useState<SortKey>('impressions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showClicks, setShowClicks] = useState(true);

  const activeCampaign = useMemo(
    () => campaigns.find(c => c.campaign === selectedCampaign),
    [campaigns, selectedCampaign]
  );

  const sortedFiltered = useMemo(() => {
    if (!activeCampaign) return [];
    const q = search.trim().toLowerCase();
    let rows = activeCampaign.publishers;
    if (q) rows = rows.filter(p => p.publisher.toLowerCase().includes(q));

    const sorted = [...rows].sort((a, b) => {
      if (sortKey === 'completedViewsPct') {
        const av = a.impressions > 0 ? a.completedViews / a.impressions : 0;
        const bv = b.impressions > 0 ? b.completedViews / b.impressions : 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      let av: string | number = a[sortKey];
      let bv: string | number = b[sortKey];
      if (typeof av === 'string') {
        av = av.toLowerCase();
        bv = (bv as string).toLowerCase();
        return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return limit === 'all' ? sorted : sorted.slice(0, parseInt(limit));
  }, [activeCampaign, search, limit, sortKey, sortDir]);

  const totals = useMemo(() => {
    if (!activeCampaign) return { impressions: 0, completedViews: 0, completedViewsPct: 0, clicks: 0, reach: 0, frequency: 0 };
    const impressions = activeCampaign.totalImpressions;
    const completedViews = activeCampaign.totalCompletedViews;
    const reach = reachByCampaign?.get(activeCampaign.campaign) || 0;
    return {
      impressions,
      completedViews,
      completedViewsPct: impressions > 0 ? (completedViews / impressions) * 100 : 0,
      clicks: activeCampaign.totalClicks,
      reach,
      frequency: reach > 0 ? impressions / reach : 0,
    };
  }, [activeCampaign, reachByCampaign]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'publisher' ? 'asc' : 'desc'); }
  }

  const SortIndicator = ({ k }: { k: SortKey }) => (
    <span className="inline-block ml-1 text-[9px] opacity-60">
      {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </span>
  );

  const kpiCards = [
    { label: 'Impressions', value: totals.impressions.toLocaleString() },
    { label: 'Completed Views', value: totals.completedViews.toLocaleString() },
    { label: 'Completed View %', value: `${totals.completedViewsPct.toFixed(2)}%` },
    { label: 'Reach', value: totals.reach.toLocaleString() },
    { label: 'Frequency', value: totals.frequency.toFixed(2) },
    ...(showClicks ? [{ label: 'Clicks', value: totals.clicks.toLocaleString() }] : []),
  ];

  const tableCols = [
    { k: 'publisher' as const, label: 'Publisher', align: 'left' as const },
    { k: 'impressions' as const, label: 'Impressions', align: 'right' as const },
    { k: 'completedViews' as const, label: 'Completed Views', align: 'right' as const },
    { k: 'completedViewsPct' as const, label: 'Completed View %', align: 'right' as const },
    ...(showClicks ? [{ k: 'clicks' as const, label: 'Clicks', align: 'right' as const }] : []),
  ];

  const colSpan = tableCols.length;

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium text-[#2D3748]" style={{ color: accentColor }}>
            Publisher Network Delivery
          </h3>
          {activeCampaign && (
            <p className="text-xs text-[#718096] mt-0.5">{activeCampaign.campaign}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-[#718096] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showClicks}
              onChange={e => setShowClicks(e.target.checked)}
              style={{ accentColor }}
            />
            Show Clicks
          </label>
          <input
            type="text"
            placeholder="Search publishers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs border border-[#E2E8F0] focus:outline-none focus:border-[#CBD5E0] w-56"
          />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#A0AEC0] mr-1">Show:</span>
            {(['20', '50', '100', 'all'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setLimit(opt)}
                className="px-2.5 py-1 border transition-colors"
                style={{
                  borderColor: limit === opt ? accentColor : '#E2E8F0',
                  color: limit === opt ? accentColor : '#718096',
                  backgroundColor: limit === opt ? `${accentColor}10` : 'white',
                }}
              >
                {opt === 'all' ? 'All' : opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="grid gap-px bg-[#E2E8F0] border-b border-[#E2E8F0]"
        style={{ gridTemplateColumns: `repeat(${kpiCards.length}, minmax(0, 1fr))` }}
      >
        {kpiCards.map(s => (
          <div key={s.label} className="bg-white px-6 py-3">
            <div className="text-[10px] uppercase tracking-wider text-[#A0AEC0]">{s.label}</div>
            <div className="text-lg font-light text-[#2D3748] mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-auto max-h-[520px]">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFB] sticky top-0">
            <tr>
              {tableCols.map(c => (
                <th
                  key={c.k}
                  onClick={() => toggleSort(c.k as SortKey)}
                  className={`px-6 py-3 text-[10px] uppercase tracking-wider font-medium text-[#718096] cursor-pointer select-none hover:text-[#2D3748] transition-colors ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}<SortIndicator k={c.k as SortKey} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="px-6 py-12 text-center text-xs text-[#A0AEC0]">Loading delivery data...</td></tr>
            ) : !activeCampaign ? (
              <tr><td colSpan={colSpan} className="px-6 py-12 text-center text-xs text-[#A0AEC0]">Select a campaign to view publisher delivery.</td></tr>
            ) : sortedFiltered.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-6 py-12 text-center text-xs text-[#A0AEC0]">No publishers match your search.</td></tr>
            ) : (
              sortedFiltered.map(p => {
                const cvPct = p.impressions > 0 ? (p.completedViews / p.impressions) * 100 : 0;
                return (
                  <tr key={p.publisher} className="border-t border-[#F1F5F9] hover:bg-[#FAFBFC] transition-colors">
                    <td className="px-6 py-2.5 text-[#2D3748]">{p.publisher}</td>
                    <td className="px-6 py-2.5 text-right tabular-nums text-[#2D3748]">{p.impressions.toLocaleString()}</td>
                    <td className="px-6 py-2.5 text-right tabular-nums text-[#718096]">{p.completedViews.toLocaleString()}</td>
                    <td className="px-6 py-2.5 text-right tabular-nums text-[#718096]">{cvPct.toFixed(2)}%</td>
                    {showClicks && (
                      <td className="px-6 py-2.5 text-right tabular-nums text-[#2D3748]">{p.clicks.toLocaleString()}</td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
