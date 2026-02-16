'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './Header';
import { KPICard } from './KPICard';
import { DataTable } from './DataTable';
import { Filters } from './Filters';
import { BrandConfig } from '@/lib/brands';
import { CampaignStats, URLBreakdown } from '@/lib/api';

interface DashboardProps {
  brand: BrandConfig;
}

interface DashboardData {
  campaigns: CampaignStats[];
  urlBreakdowns: { campaignId: string; urls: URLBreakdown[] }[];
}

export function Dashboard({ brand }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedDealership, setSelectedDealership] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState('');

  const [forceRefresh, setForceRefresh] = useState(false);

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

  useEffect(() => {
    fetchData();
    // Auto-refresh every 15 minutes (checks for new campaigns)
    const interval = setInterval(() => fetchData(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filter the data
  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    
    return data.campaigns.filter(campaign => {
      if (selectedDealership && campaign['Campaign Title'] !== selectedDealership) {
        return false;
      }
      if (selectedInvoice && campaign['Invoice #'] !== selectedInvoice) {
        return false;
      }
      return true;
    });
  }, [data?.campaigns, selectedDealership, selectedInvoice]);

  // Calculate aggregates
  const aggregates = useMemo(() => {
    const campaigns = filteredCampaigns;
    
    const totalCampaigns = campaigns.length;
    const totalOpens = campaigns.reduce((sum, c) => sum + (c['Total Opens'] || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c['Total Clicks'] || 0), 0);
    const totalEmails = campaigns.reduce((sum, c) => sum + parseInt(String(c['Total Emails'] || '0')), 0);
    
    const avgOpenRate = totalEmails > 0 ? (totalOpens / totalEmails) * 100 : 0;
    const avgClickRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;

    return { totalCampaigns, totalOpens, totalClicks, totalEmails, avgOpenRate, avgClickRate };
  }, [filteredCampaigns]);

  // Extract filter options
  const dealerships = useMemo(() => {
    if (!data?.campaigns) return [];
    const unique = new Set(data.campaigns.map(c => c['Campaign Title']).filter(Boolean));
    return Array.from(unique).sort();
  }, [data?.campaigns]);

  const invoices = useMemo(() => {
    if (!data?.campaigns) return [];
    const unique = new Set(data.campaigns.map(c => c['Invoice #']).filter(Boolean));
    return Array.from(unique).sort();
  }, [data?.campaigns]);

  // Build a lookup of campaign dates by ID
  const campaignDateMap = useMemo(() => {
    if (!data?.campaigns) return new Map<string, string>();
    const map = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of data.campaigns as any[]) {
      const id = String(c['Campaign ID'] || '');
      map.set(id, c['Launch Date'] || c['Create Date'] || '');
    }
    return map;
  }, [data?.campaigns]);

  // URL data - extract from campaigns directly (each campaign has URL Breakdown embedded)
  const urlData = useMemo(() => {
    if (!data?.campaigns) return [];
    
    // First try the separate urlBreakdowns array
    if (data.urlBreakdowns && data.urlBreakdowns.length > 0) {
      return data.urlBreakdowns.flatMap(({ campaignId, urls }) =>
        urls.map(url => ({ ...url, campaignId, Date: campaignDateMap.get(campaignId) || '' }))
      );
    }
    
    // Fallback: extract URL Breakdown from each campaign's stats object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.campaigns as any[]).flatMap((campaign) => {
      const urls = (campaign['URL Breakdown'] as Array<Record<string, unknown>>) || [];
      const campaignId = String(campaign['Campaign ID'] || '');
      const date = campaign['Launch Date'] || campaign['Create Date'] || '';
      return urls.map(url => ({ ...url, campaignId, Date: date }));
    });
  }, [data?.campaigns, data?.urlBreakdowns, campaignDateMap]);

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
            selectedDealership={selectedDealership}
            onDealershipChange={setSelectedDealership}
            invoices={invoices}
            selectedInvoice={selectedInvoice}
            onInvoiceChange={setSelectedInvoice}
            accentColor={brand.primaryColor}
          />
        </div>

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
            title="Total Opens"
            value={aggregates.totalOpens}
            loading={loading}
          />
          <KPICard
            title="Total Clicks"
            value={aggregates.totalClicks}
            loading={loading}
          />
          <KPICard
            title="Total Emails Sent"
            value={aggregates.totalEmails}
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
            data={filteredCampaigns as unknown as Record<string, unknown>[]}
            loading={loading}
            accentColor={brand.primaryColor}
            defaultSortKey="Launch Date"
            defaultSortDirection="desc"
            columns={[
              { key: 'Campaign ID' as keyof CampaignStats, header: 'Campaign ID' },
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

          <DataTable
            title="Link Clicks Summary"
            data={urlData as Record<string, unknown>[]}
            loading={loading}
            accentColor={brand.primaryColor}
            defaultSortKey="Date"
            defaultSortDirection="desc"
            columns={[
              { key: 'URLID', header: 'URL ID' },
              { key: 'campaignId', header: 'Campaign' },
              { 
                key: 'Date', 
                header: 'Date',
                render: (value: unknown) => {
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
                key: 'Clicks', 
                header: 'Clicks',
                align: 'right' as const,
                render: (value: unknown) => (value as number)?.toLocaleString() ?? '—'
              },
              { 
                key: 'Unique Clicks', 
                header: 'Unique Clicks',
                align: 'right' as const,
                render: (value: unknown) => (value as number)?.toLocaleString() ?? '—'
              },
              { 
                key: 'URL', 
                header: 'URL',
                render: (value) => (
                  <span 
                    className="text-[#718096] truncate block max-w-[300px]" 
                    title={value as string}
                  >
                    {value as string}
                  </span>
                )
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
}
