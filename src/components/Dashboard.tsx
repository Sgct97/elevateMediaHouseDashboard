'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './Header';
import { KPICard } from './KPICard';
import { DataTable } from './DataTable';
import { Filters } from './Filters';
import { LinkClicksPivot } from './LinkClicksPivot';
import { AdStirSection } from './AdStirSection';
import { Datasys360Section } from './Datasys360Section';
import { GroundTruthSection } from './GroundTruthSection';
import { BrandConfig } from '@/lib/brands';
import { CampaignStats } from '@/lib/api';
import type { AdStirRecord } from '@/app/api/adstir/route';
import type { Datasys360Campaign } from '@/app/api/datasys360/route';
import type { GroundTruthCampaign } from '@/app/api/groundtruth/route';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedDealerships, setSelectedDealerships] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  // PDF export
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      const el = reportRef.current;

      const pdfHeader = el.querySelector('.pdf-header') as HTMLElement | null;
      if (pdfHeader) pdfHeader.style.display = 'block';

      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FAFBFC',
        windowWidth: 1400,
      });

      if (pdfHeader) pdfHeader.style.display = '';

      const imgWidth = 277;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageHeight = pdf.internal.pageSize.getHeight();

      let position = 0;
      let heightLeft = imgHeight;
      const imgData = canvas.toDataURL('image/png');

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20);

      while (heightLeft > 0) {
        position -= (pageHeight - 10);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 10);
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const filters = [];
      if (dateRange.start) filters.push(dateRange.start);
      if (dateRange.end) filters.push(dateRange.end);
      const suffix = filters.length ? `_${filters.join('_to_')}` : '';
      pdf.save(`Campaign_Report${suffix}_${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [dateRange, searchQuery]);

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

  // Datasys360 social campaign data
  const [ds360Data, setDs360Data] = useState<Datasys360Campaign[]>([]);
  const [ds360Loading, setDs360Loading] = useState(true);

  // GroundTruth geofence campaign data
  const [gtData, setGtData] = useState<GroundTruthCampaign[]>([]);
  const [gtLoading, setGtLoading] = useState(true);


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

  const fetchDs360Data = useCallback(async (refresh = false) => {
    try {
      setDs360Loading(true);
      const url = refresh ? '/api/datasys360?refresh=true' : '/api/datasys360';
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setDs360Data(result.data || []);
      }
    } catch {
      // fail silently
    } finally {
      setDs360Loading(false);
    }
  }, []);

  const fetchGtData = useCallback(async (refresh = false) => {
    try {
      setGtLoading(true);
      const url = refresh ? '/api/groundtruth?refresh=true' : '/api/groundtruth';
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setGtData(result.data || []);
      }
    } catch {
      // fail silently
    } finally {
      setGtLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchData();
    fetchAdstirData();
    fetchDs360Data();
    fetchGtData();
    const interval = setInterval(() => {
      fetchData(true);
      fetchAdstirData(true);
      fetchDs360Data(true);
      fetchGtData(true);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, fetchAdstirData, fetchDs360Data, fetchGtData]);

  // Filter the data
  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    
    return data.campaigns.filter(campaign => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const title = (campaign['Campaign Title'] || '').toLowerCase();
        const invoice = (campaign['Invoice #'] || '').toLowerCase();
        if (!title.includes(q) && !invoice.includes(q)) return false;
      }
      if (selectedDealerships.size > 0 && !selectedDealerships.has(campaign['Campaign Title'])) {
        return false;
      }
      if (selectedInvoices.size > 0 && !selectedInvoices.has(campaign['Invoice #'])) {
        return false;
      }
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
  }, [data?.campaigns, searchQuery, selectedDealerships, selectedInvoices, dateRange]);

  // Remove hidden campaigns from the visible set
  const visibleCampaigns = useMemo(() => {
    if (hiddenCampaignIds.size === 0) return filteredCampaigns;
    return filteredCampaigns.filter(c => !hiddenCampaignIds.has(String(c['Campaign ID'])));
  }, [filteredCampaigns, hiddenCampaignIds]);

  // Calculate aggregates
  const aggregates = useMemo(() => {
    const campaigns = visibleCampaigns;
    
    const totalCampaigns = campaigns.length;
    const totalUniqueOpens = campaigns.reduce((sum, c) => sum + (c['Unique Opens'] || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c['Total Clicks'] || 0), 0);
    const totalEmails = campaigns.reduce((sum, c) => sum + parseInt(String(c['Total Emails'] || '0')), 0);
    
    const avgUniqueOpenRate = totalEmails > 0 ? (totalUniqueOpens / totalEmails) * 100 : 0;
    const avgClickRate = totalEmails > 0 ? (totalClicks / totalEmails) * 100 : 0;

    return { totalCampaigns, totalUniqueOpens, totalClicks, totalEmails, avgUniqueOpenRate, avgClickRate };
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
    let pool = dateFilteredCampaigns;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(c =>
        (c['Campaign Title'] || '').toLowerCase().includes(q) ||
        (c['Invoice #'] || '').toLowerCase().includes(q)
      );
    }
    const unique = new Set(pool.map(c => c['Campaign Title']).filter(Boolean));
    return Array.from(unique).sort();
  }, [dateFilteredCampaigns, searchQuery]);

  const invoices = useMemo(() => {
    let pool = dateFilteredCampaigns;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(c =>
        (c['Campaign Title'] || '').toLowerCase().includes(q) ||
        (c['Invoice #'] || '').toLowerCase().includes(q)
      );
    }
    if (selectedDealerships.size > 0) {
      pool = pool.filter(c => selectedDealerships.has(c['Campaign Title']));
    }
    const unique = new Set(pool.map(c => c['Invoice #']).filter(Boolean));
    return Array.from(unique).sort();
  }, [dateFilteredCampaigns, searchQuery, selectedDealerships]);

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
        onRefresh={() => { fetchData(true); fetchAdstirData(true); fetchDs360Data(true); fetchGtData(true); }}
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
          
          {/* Filters + Download */}
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleDownloadPDF}
              disabled={isExporting || loading}
              className="px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {isExporting ? 'Generating PDF...' : 'Download PDF'}
            </button>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients..."
                className="px-4 py-2 text-sm border-2 bg-white min-w-[180px] focus:outline-none"
                style={{ borderColor: brand.primaryColor }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#2D3748] text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
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

        {/* PDF capture area */}
        <div ref={reportRef} className="bg-[#FAFBFC]">

        {/* PDF-only header with logo — hidden on screen, visible in PDF */}
        <div className="pdf-header hidden mb-6">
          <div className="flex items-center justify-between pb-4 border-b-2" style={{ borderColor: brand.primaryColor }}>
            <img src={brand.logo} alt={brand.name} className="h-14 object-contain" />
            <div className="text-right">
              <h2 className="text-xl font-light text-[#2D3748]">Conquest Email Campaign Report</h2>
              <p className="text-xs text-[#718096] mt-1">
                {dateRange.start && dateRange.end
                  ? `${dateRange.start} — ${dateRange.end}`
                  : dateRange.start || dateRange.end || 'All dates'}
                {searchQuery && ` · Search: "${searchQuery}"`}
              </p>
              <p className="text-[10px] text-[#A0AEC0] mt-0.5">
                Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
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
            title="Sum Total Unique Opens"
            value={aggregates.totalUniqueOpens}
            loading={loading}
          />
          <KPICard
            title="Sum Total Clicks"
            value={aggregates.totalClicks}
            loading={loading}
          />
          <KPICard
            title="Average Unique Open Rate"
            value={aggregates.avgUniqueOpenRate}
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
                key: 'Unique Opens' as keyof CampaignStats, 
                header: 'Unique Opens',
                align: 'right',
                render: (value) => (value as number)?.toLocaleString() ?? '—'
              },
              { 
                key: 'Unique Opens Rate' as keyof CampaignStats, 
                header: 'Unique Open Rate',
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
              'URL Breakdown'?: Array<{ URLID: number; Type?: string; Clicks: number; 'Unique Clicks': number; URL: string }>;
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
            searchQuery={searchQuery}
          />

          <Datasys360Section
            data={ds360Data}
            loading={ds360Loading}
            accentColor={brand.primaryColor}
            searchQuery={searchQuery}
          />

          <GroundTruthSection
            data={gtData}
            loading={gtLoading}
            accentColor={brand.primaryColor}
            searchQuery={searchQuery}
          />

        </div>
        </div>{/* end PDF capture area */}
      </main>
    </div>
  );
}
