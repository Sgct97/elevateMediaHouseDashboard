'use client';

import { useState, useMemo } from 'react';
import type { AdStirPacingRecord } from '@/app/api/adstir-pacing/route';

interface AdStirPacingProps {
  data: AdStirPacingRecord[];
  loading: boolean;
  accentColor: string;
  reportDate?: string;
  searchQuery?: string;
}

function pacingColor(pacing: number): string {
  if (pacing >= 95) return '#38A169';
  if (pacing >= 80) return '#EAB308';
  return '#E53E3E';
}

function statusFromDates(flightEnd: string): 'Active' | 'Expired' {
  if (!flightEnd) return 'Active';
  const parts = flightEnd.split('/');
  if (parts.length !== 3) return 'Active';
  const end = new Date(+parts[2], +parts[0] - 1, +parts[1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > end ? 'Expired' : 'Active';
}

function statusColor(status: string): string {
  return status === 'Active' ? '#38A169' : '#E53E3E';
}

export function AdStirPacing({ data, loading, accentColor, reportDate, searchQuery }: AdStirPacingProps) {
  const [sortKey, setSortKey] = useState<string>('pacingPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedClient, setSelectedClient] = useState('');
  const [hideExpired, setHideExpired] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const clients = useMemo(() => {
    const unique = new Set(data.map(r => r.client).filter(Boolean));
    return Array.from(unique).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.client.toLowerCase().includes(q) || r.product.toLowerCase().includes(q));
    }
    if (selectedClient) {
      result = result.filter(r => r.client === selectedClient);
    }
    if (hideExpired) {
      result = result.filter(r => statusFromDates(r.flightEnd) !== 'Expired');
    }
    return result;
  }, [data, searchQuery, selectedClient, hideExpired]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = a[sortKey as keyof AdStirPacingRecord];
      const bVal = b[sortKey as keyof AdStirPacingRecord];
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

  const activeCt = filtered.filter(r => statusFromDates(r.flightEnd) === 'Active').length;
  const expiredCt = filtered.filter(r => statusFromDates(r.flightEnd) === 'Expired').length;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'client' || key === 'product' ? 'asc' : 'desc');
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
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">AdStir Pacing Report</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">Loading AdStir pacing data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0]">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">AdStir Pacing Report</h2>
        </div>
        <div className="p-8 text-center text-[#718096] text-sm">No AdStir pacing data available.</div>
      </div>
    );
  }

  const columns: { key: string; label: string; align: 'left' | 'right'; render: (r: AdStirPacingRecord) => string | JSX.Element }[] = [
    { key: 'client', label: 'Client', align: 'left', render: r => r.client },
    { key: 'product', label: 'Product', align: 'left', render: r => r.product },
    { key: 'flightStart', label: 'Flight Start', align: 'left', render: r => r.flightStart },
    { key: 'flightEnd', label: 'Flight End', align: 'left', render: r => r.flightEnd },
    {
      key: 'status', label: 'Status', align: 'left',
      render: r => {
        const s = statusFromDates(r.flightEnd);
        return <span style={{ color: statusColor(s) }} className="font-semibold">{s}</span>;
      }
    },
    { key: 'deliveredImpressions', label: 'Delivered Imps', align: 'right', render: r => r.deliveredImpressions.toLocaleString() },
    { key: 'deliveryPct', label: 'Delivery %', align: 'right', render: r => `${r.deliveryPct.toFixed(2)}%` },
    {
      key: 'pacingPct', label: 'Pacing %', align: 'right',
      render: r => <span style={{ color: pacingColor(r.pacingPct) }} className="font-semibold">{r.pacingPct.toFixed(2)}%</span>
    },
  ];

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#2D3748] uppercase tracking-wide">AdStir Pacing Report</h2>
          {reportDate && <p className="text-[10px] text-[#A0AEC0] mt-0.5">Report period: {reportDate}</p>}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={selectedClient}
            onChange={(e) => { setSelectedClient(e.target.value); setPage(0); }}
            className="text-xs border border-[#E2E8F0] px-2 py-1.5 text-[#4A5568] bg-white min-w-[180px]"
          >
            <option value="">All Clients</option>
            {clients.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-[#718096] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideExpired}
              onChange={(e) => { setHideExpired(e.target.checked); setPage(0); }}
              className="accent-current"
              style={{ accentColor }}
            />
            Hide Expired
          </label>
          <div className="flex items-center gap-4 text-xs text-[#718096]">
            <span>Active: <strong className="text-[#38A169]">{activeCt}</strong></span>
            {!hideExpired && <span>Expired: <strong className="text-[#E53E3E]">{expiredCt}</strong></span>}
            <span>Total: <strong className="text-[#2D3748]">{filtered.length}</strong></span>
          </div>
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
                key={`${row.client}-${row.product}-${row.flightStart}-${i}`}
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
