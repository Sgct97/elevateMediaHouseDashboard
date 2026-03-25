'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './Header';
import { KPICard } from './KPICard';
import { DataTable } from './DataTable';
import { Filters } from './Filters';
import { LinkClicksPivot } from './LinkClicksPivot';
import { AdStirSection } from './AdStirSection';
import { BrandConfig } from '@/lib/brands';
import { CampaignStats } from '@/lib/api';
import type { AdStirRecord } from '@/app/api/adstir/route';

interface DashboardProps {
  brand: BrandConfig;
}

interface DashboardData {
  campaigns: CampaignStats[];
  urlBreakdowns: { campaignId: string; urls: unknown[] }[];
}

// Helper to parse a date string into a date-only comparable (avoids UTC vs local timezone issues)
function toDateOnly(str: string): number {
  const d = new Date(str);
  if (isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function Dashboard({ brand }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedDealerships, setSelectedDealerships] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  // Hidden drops (by Campaign ID) — server-persisted, shared across all users
  const [hiddenCampaignIds, setHiddenCampaignIds] = useState<Set<string>>(new Set());

  // Fetch hidden IDs from server on mount
  useEffect(() => {
    fetch('/api/hidden-drops')
      .then(res => res.json())
      .then(data => setHiddenCampaignIds(new Set(data.hiddenIds || [])))
      .catch(() => {}); // fail silently — no hidden drops if server is down
  }, []);

  const hideCampaign = useCallback(async (id: string) => {
    // Optimistic update
    setHiddenCampaignIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch('/api/hidden-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide', campaignId: id }),
      });
      const data = await res.json();
      setHiddenCampaignIds(new Set(data.hiddenIds));
    } catch {
      // Keep the optimistic update even if server call fails
    }
  }, []);

  const unhideCampaign = useCallback(async (id: string) => {
    setHiddenCampaignIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch('/api/hidden-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unhide', campaignId: id }),
      });
      const data = await res.json();
      setHiddenCampaignIds(new Set(data.hiddenIds));
    } catch {
      // Keep the optimistic update even if server call fails
    }
  }, []);

  const unhideAll = useCallback(async () => {
    setHiddenCampaignIds(new Set());
    try {
      const res = await fetch('/api/hidden-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unhideAll' }),
      });
      const data = await res.json();
      setHiddenCampaignIds(new Set(data.hiddenIds));
    } catch {
      // Keep the optimistic clear even if server call fails
    }
  }, []);

  // Toggle for showing hidden drops list
  const [showHiddenList, setShowHiddenList] = useState(false);

  // AdStir retargeting data
  const [adstirData, setAdstirData] = useState<AdStirRecord[]>([]);
  const [adstirLoading, setAdstirLoading] = useState(true);

  const fetchData = useCallback(async (refresh = false) => {
    try {
      setIsRefreshing(true);
      setError(null);
      
      const url = refresh ? '/api/campaigns?refresh=true' : '/api/campaigns';
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }
      
      const result = await response.json();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchAdstirData = useCallback(async (refresh = false) => {
    try {
      setAdstirLoading(true);
      const url = refresh ? '/api/adstir?refresh=true' : '/api/adstir';
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setAdstirData(result.data || []);
      }
    } catch {
      // fail silently — adstir section will show empty state
    } finally {
      setAdstirLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchAdstirData();
    // Auto-refresh every 15 minutes (checks for new campaigns + new AdStir data)
    const interval = setInterval(() => {
      fetchData(true);
      fetchAdstirData(true);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, fetchAdstirData]);

  // Filter the data
  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    
    return data.campaigns.filter(campaign => {
      if (selectedDealerships.size > 0 && !selectedDealerships.has(campaign['Campaign Title'])) {
        return false;
      }
      if (selectedInvoices.size > 0 && !selectedInvoices.has(campaign['Invoice #'])) {
        return false;
      }
      // Date range filter
      if (dateRange.start || dateRange.end) {
        const launchStr = campaign['Launch Date'] || campaign['Create Date'];
        if (!launchStr) return false;
        const launchDay = toDateOnly(launchStr as string);
        if (isNaN(launchDay)) return false;
        if (dateRange.start) {
          const [y, m, d] = dateRange.start.split('-').map(Number);
          const startDay = new Date(y, m - 1, d).getTime();
          if (launchDay < startDay) return false;
        }
        if (dateRange.end) {
          const [y, m, d] = dateRange.end.split('-').map(Number);
          const endDay = new Date(y, m - 1, d).getTime();
          if (launchDay > endDay) return false;
        }
      }
      return true;
    });
  }, [data?.campaigns, selectedDealerships, selectedInvoices, dateRange]);

  // Remove hidden campaigns from the visible set
  const visibleCampaigns = useMemo(() => {
    if (hiddenCampaignIds.size === 0) return filteredCampaigns;
    return filteredCampaigns.filter(c => !hiddenCampaignIds.has(String(c['Campaign ID'])));
  }, [filteredCampaigns, hiddenCampaignIds]);

  // Calculate aggregates
  const aggregates = useMemo(() => {
    const campaigns = visibleCampaigns;
    
    const totalCampaigns = campaigns.length;
    const totalOpens = campaigns.reduce((sum, c) => sum + (c['Total Opens'] || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c['Total Clicks'] || 0), 0);
    const totalEmails = campaigns.reduce((sum, c) => sum + parseInt(String(c['Total Emails'] || '0')), 0);
    
    const avgOpenRate = totalEmails > 0 ? (totalOpens / totalEmails) * 100 : 0;
    const avgClickRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;

    return { totalCampaigns, totalOpens, totalClicks, totalEmails, avgOpenRate, avgClickRate };
  }, [visibleCampaigns]);

  // Date-filtered campaigns (before dealership/invoice filters) — used for cascading dropdowns
  const dateFilteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    if (!dateRange.start && !dateRange.end) return data.campaigns;

    return data.campaigns.filter(campaign => {
      const launchStr = campaign['Launch Date'] || campaign['Create Date'];
      if (!launchStr) return false;
      const launchDay = toDateOnly(launchStr as string);
      if (isNaN(launchDay)) return false;
      if (dateRange.start) {
        const [y, m, d] = dateRange.start.split('-').map(Number);
        if (launchDay < new Date(y, m - 1, d).getTime()) return false;
      }
      if (dateRange.end) {
        const [y, m, d] = dateRange.end.split('-').map(Number);
        if (launchDay > new Date(y, m - 1, d).getTime()) return false;
      }
      return true;
    });
  }, [data?.campaigns, dateRange]);

  // Cascading filter options — dealerships narrow by date, invoices narrow by date + dealership
  const dealerships = useMemo(() => {
    const unique = new Set(dateFilteredCampaigns.map(c => c['Campaign Title']).filter(Boolean));
    return Array.from(unique).sort();
  }, [dateFilteredCampaigns]);

  const invoices = useMemo(() => {
    let pool = dateFilteredCampaigns;
    if (selectedDealerships.size > 0) {
      pool = pool.filter(c => selectedDealerships.has(c['Campaign Title']));
    }
    const unique = new Set(pool.map(c => c['Invoice #']).filter(Boolean));
    return Array.from(unique).sort();
  }, [dateFilteredCampaigns, selectedDealerships]);

  // Auto-clear stale selections when filter options change
  useEffect(() => {
    if (selectedDealerships.size > 0) {
      const valid = new Set(Array.from(selectedDealerships).filter(d => dealerships.includes(d)));
      if (valid.size !== selectedDealerships.size) {
        setSelectedDealerships(valid);
      }
    }
  }, [dealerships, selectedDealerships]);

  useEffect(() => {
    if (selectedInvoices.size > 0) {
      const valid = new Set(Array.from(selectedInvoices).filter(i => invoices.includes(i)));
      if (valid.size !== selectedInvoices.size) {
        setSelectedInvoices(valid);
      }
    }
  }, [invoices, selectedInvoices]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFBFC' }}>
      <Header 
        brand={brand} 
        lastUpdated={lastUpdated}
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
      />

      <main className="px-6 py-8 max-w-[1400px] mx-auto">
        {/* Title Section */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light text-[#2D3748] mb-1">
              Conquest Email Campaign Report
            </h1>
            <div 
              className="w-48 h-0.5 mt-2"
              style={{ backgroundColor: brand.primaryColor }}
            />
          </div>
          
          {/* Filters */}
          <Filters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            dealerships={dealerships}
            selectedDealerships={selectedDealerships}
            onDealershipsChange={setSelectedDealerships}
            invoices={invoices}
            selectedInvoices={selectedInvoices}
            onInvoicesChange={setSelectedInvoices}
            accentColor={brand.primaryColor}
          />
        </div>

        {/* Hidden drops indicator */}
        {hiddenCampaignIds.size > 0 && (
          <div className="mb-6 bg-white border border-[#E2E8F0] text-sm">
            <div className="px-4 py-2.5 flex items-center gap-3 text-[#718096]">
              <button
                onClick={() => setShowHiddenList(prev => !prev)}
                className="flex items-center gap-1.5 hover:text-[#2D3748] transition-colors"
              >
                <span className="text-[10px]">{showHiddenList ? '▼' : '▶'}</span>
                <span>{hiddenCampaignIds.size} drop{hiddenCampaignIds.size !== 1 ? 's' : ''} hidden</span>
              </button>
              <button
                onClick={unhideAll}
                className="px-3 py-1 text-xs border hover:bg-[#F8FAFB] transition-colors ml-auto"
                style={{ color: brand.primaryColor, borderColor: brand.primaryColor }}
              >
                Show all
              </button>
            </div>
            {showHiddenList && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {Array.from(hiddenCampaignIds).sort().map(id => (
                  <button
                    key={id}
                    onClick={() => unhideCampaign(id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#F8FAFB] border border-[#E2E8F0] text-[#718096] hover:bg-white hover:border-[#CBD5E0] transition-colors"
                    title={`Unhide drop ${id}`}
                  >
                    Drop {id}
                    <span className="text-[#A0AEC0] hover:text-[#2D3748]">✕</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-white border border-[#E2E8F0] text-sm text-[#718096]">
            <strong className="text-[#2D3748]">Note:</strong> {error}
            {error.includes('credentials') && (
              <span className="block mt-1">
                Configure API credentials to load live data.
              </span>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[#E2E8F0] mb-8">
          <KPICard
            title="Campaign Deployments"
            value={aggregates.totalCampaigns}
            loading={loading}
          />
          <KPICard
            title="Total Emails Sent"
            value={aggregates.totalEmails}
            loading={loading}
          />
          <KPICard
            title="Sum Total Opens"
            value={aggregates.totalOpens}
            loading={loading}
          />
          <KPICard
            title="Sum Total Clicks"
            value={aggregates.totalClicks}
            loading={loading}
          />
          <KPICard
            title="Average Open Rate"
            value={aggregates.avgOpenRate}
            loading={loading}
            format="percentage"
          />
          <KPICard
            title="Average Click-through Rate"
            value={aggregates.avgClickRate}
            loading={loading}
            format="percentage"
          />
        </div>

        {/* Tables */}
        <div className="space-y-6">
          <DataTable
            title="Email Deployment Performance"
            data={visibleCampaigns as unknown as Record<string, unknown>[]}
            loading={loading}
            accentColor={brand.primaryColor}
            defaultSortKey="Launch Date"
            defaultSortDirection="desc"
            onHideRow={(row) => hideCampaign(String(row['Campaign ID']))}
            columns={[
              { 
                key: 'Launch Date' as keyof CampaignStats, 
                header: 'Launch Date',
                render: (value) => {
                  if (!value) return '—';
                  const date = new Date(value as string);
                  return isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });
                }
              },
              { 
                key: 'Total Opens' as keyof CampaignStats, 
                header: 'Total Opens',
                align: 'right',
                render: (value) => (value as number)?.toLocaleString() ?? '—'
              },
              { 
                key: 'Opens Rate' as keyof CampaignStats, 
                header: 'Open Rate',
                align: 'right',
                render: (value) => value ? `${(parseFloat(value as string) * 100).toFixed(2)}%` : '—'
              },
              { 
                key: 'Total Clicks' as keyof CampaignStats, 
                header: 'Total Clicks',
                align: 'right',
                render: (value) => (value as number)?.toLocaleString() ?? '—'
              },
              { 
                key: 'Click Thru Rate' as keyof CampaignStats, 
                header: 'Click Through Rate',
                align: 'right',
                render: (value) => value ? `${(parseFloat(value as string) * 100).toFixed(2)}%` : '—'
              },
            ]}
          />

          <LinkClicksPivot
            campaigns={visibleCampaigns as unknown as Array<{
              'Campaign ID': number | string;
              'Invoice #': string;
              'Campaign Title': string;
              'Launch Date': string | null;
              'Create Date': string | null;
              'URL Breakdown'?: Array<{ URLID: number; Clicks: number; 'Unique Clicks': number; URL: string }>;
              [key: string]: unknown;
            }>}
            loading={loading}
            accentColor={brand.primaryColor}
            onHideDrop={hideCampaign}
          />

          <AdStirSection
            data={adstirData}
            loading={adstirLoading}
            accentColor={brand.primaryColor}
            dateRange={dateRange}
          />
        </div>
      </main>
    </div>
  );
}
