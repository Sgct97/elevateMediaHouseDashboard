'use client';

import { useMemo, useState } from 'react';
import type { CampaignDelivery } from '@/app/api/adstir-delivery/route';

interface Props {
  campaigns: CampaignDelivery[];
  selectedCampaign: string;
  accentColor: string;
  loading: boolean;
}

type SortKey = 'publisher' | 'impressions' | 'completedViews' | 'clicks';
type SortDir = 'asc' | 'desc';

export function PublisherNetworkDelivery({ campaigns, selectedCampaign, accentColor, loading }: Props) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState<'20' | '50' | '100' | 'all'>('50');
  const [sortKey, setSortKey] = useState<SortKey>('impressions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
    if (!activeCampaign) return { impressions: 0, completedViews: 0, clicks: 0, publishers: 0 };
    return {
      impressions: activeCampaign.totalImpressions,
      completedViews: activeCampaign.totalCompletedViews,
      clicks: activeCampaign.totalClicks,
      publishers: activeCampaign.publishers.length,
    };
  }, [activeCampaign]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'publisher' ? 'asc' : 'desc'); }
  }

  const SortIndicator = ({ k }: { k: SortKey }) => (
    <span className="inline-block ml-1 text-[9px] opacity-60">
      {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </span>
  );

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

      <div className="grid grid-cols-4 gap-px bg-[#E2E8F0] border-b border-[#E2E8F0]">
        {[
          { label: 'Publishers', value: totals.publishers.toLocaleString() },
          { label: 'Impressions', value: totals.impressions.toLocaleString() },
          { label: 'Completed Views', value: totals.completedViews.toLocaleString() },
          { label: 'Clicks', value: totals.clicks.toLocaleString() },
        ].map(s => (
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
              {([
                { k: 'publisher', label: 'Publisher', align: 'left' },
                { k: 'impressions', label: 'Impressions', align: 'right' },
                { k: 'completedViews', label: 'Completed Views', align: 'right' },
                { k: 'clicks', label: 'Clicks', align: 'right' },
              ] as const).map(c => (
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
              <tr><td colSpan={4} className="px-6 py-12 text-center text-xs text-[#A0AEC0]">Loading delivery data...</td></tr>
            ) : !activeCampaign ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-xs text-[#A0AEC0]">Select a campaign to view publisher delivery.</td></tr>
            ) : sortedFiltered.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-xs text-[#A0AEC0]">No publishers match your search.</td></tr>
            ) : (
              sortedFiltered.map(p => (
                <tr key={p.publisher} className="border-t border-[#F1F5F9] hover:bg-[#FAFBFC] transition-colors">
                  <td className="px-6 py-2.5 text-[#2D3748]">{p.publisher}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-[#2D3748]">{p.impressions.toLocaleString()}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-[#718096]">{p.completedViews.toLocaleString()}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-[#2D3748]">{p.clicks.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
