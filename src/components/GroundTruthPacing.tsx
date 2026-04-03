'use client';

import { useState, useMemo } from 'react';
import type { PacingCampaign } from '@/app/api/groundtruth/pacing/route';

interface GroundTruthPacingProps {
  data: PacingCampaign[];
  loading: boolean;
  accentColor: string;
  searchQuery?: string;
}

function pacingColor(pacing: number): string {
  if (pacing >= 95) return '#38A169';
  if (pacing >= 80) return '#EAB308';
  return '#E53E3E';
}

function statusColor(status: string): string {
  if (status === 'Active') return '#38A169';
  if (status === 'Expired') return '#E53E3E';
  return '#718096';
}

export function GroundTruthPacing({ data, loading, accentColor, searchQuery }: GroundTruthPacingProps) {
  const [sortKey, setSortKey] = useState<string>('campaignName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const campaignNames = useMemo(() => {
    const unique = new Set(data.map(r => r.campaignName).filter(Boolean));
    return Array.from(unique).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.campaignName.toLowerCase().includes(q));
    }
    if (selectedCampaign) {
      result = result.filter(r => r.campaignName === selectedCampaign);
    }
    return result;
  }, [data, searchQuery, selectedCampaign]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = a[sortKey as keyof PacingCampaign];
      const bVal = b[sortKey as keyof PacingCampaign];
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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'campaignName' ? 'asc' : 'desc');
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
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Geofence Pacing Report</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">Loading pacing data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Geofence Pacing Report</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">No pacing data available.</div>
      </div>
    );
  }

  const activeCt = filtered.filter(r => r.status === 'Active').length;
  const expiredCt = filtered.filter(r => r.status === 'Expired').length;

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">Geofence Pacing Report</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={selectedCampaign}
            onChange={(e) => { setSelectedCampaign(e.target.value); setPage(0); }}
            className="text-xs border border-[#E2E8F0] px-2 py-1.5 text-[#4A5568] bg-white min-w-[180px]"
          >
            <option value="">All Campaigns</option>
            {campaignNames.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex items-center gap-4 text-xs text-[#718096]">
            <span>Active: <strong className="text-[#38A169]">{activeCt}</strong></span>
            <span>Expired: <strong className="text-[#E53E3E]">{expiredCt}</strong></span>
            <span>Total: <strong className="text-[#2D3748]">{filtered.length}</strong></span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-[#F8FAFB] border-b border-[#E2E8F0]">
              <th
                className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('campaignName')}
              >
                Campaign Name{sortIndicator('campaignName')}
              </th>
              <th
                className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('status')}
              >
                Status{sortIndicator('status')}
              </th>
              <th
                className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-[#A0AEC0] cursor-pointer whitespace-nowrap hover:text-[#4A5568]"
                onClick={() => handleSort('pacing')}
              >
                Pacing{sortIndicator('pacing')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr
                key={row.campaignId}
                className={`border-b border-[#F0F3F5] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-[#F0F4FF] transition-colors`}
              >
                <td className="px-4 py-3 text-[#4A5568]">{row.campaignName}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm font-semibold" style={{ color: statusColor(row.status) }}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-semibold" style={{ color: pacingColor(row.pacing) }}>
                    {row.pacing.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[#A0AEC0]">
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
