'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PublisherNetworkDelivery } from './PublisherNetworkDelivery';
import { ZipHeatmap } from './ZipHeatmap';
import { PublisherMultiSelect } from './PublisherMultiSelect';
import { PdfHeader } from './PdfHeader';
import { usePdfExport } from '@/lib/usePdfExport';
import { BrandConfig } from '@/lib/brands';
import type { CampaignDelivery } from '@/app/api/adstir-delivery/route';
import type { AdStirRecord } from '@/app/api/adstir/route';

interface CTVDashboardProps {
  brand: BrandConfig;
}

function toDateOnly(value: string): number {
  if (!value) return NaN;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return NaN;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function formatDateForInput(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function CTVDashboard({ brand }: CTVDashboardProps) {
  const [deliveryData, setDeliveryData] = useState<CampaignDelivery[]>([]);
  const [deliveryEmailDate, setDeliveryEmailDate] = useState<string>('');
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [flightDateRange, setFlightDateRange] = useState({ start: '', end: '' });
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [adstirData, setAdstirData] = useState<AdStirRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { reportRef, exportPdf, isExporting } = usePdfExport<HTMLDivElement>({
    filename: 'CTV_Dashboard',
  });

  const fetchDeliveryData = useCallback(async (refresh = false) => {
    try {
      const url = refresh ? '/api/adstir-delivery?refresh=true' : '/api/adstir-delivery';
      const res = await fetch(url);
      const json = await res.json();
      if (Array.isArray(json.campaigns)) {
        setDeliveryData(json.campaigns);
        setDeliveryEmailDate(json.emailDate || '');
      }
    } catch (err) {
      console.error('Error fetching delivery data:', err);
    } finally {
      setDeliveryLoading(false);
    }
  }, []);

  const fetchAdstirData = useCallback(async (refresh = false) => {
    try {
      const url = refresh ? '/api/adstir?refresh=true' : '/api/adstir';
      const res = await fetch(url);
      const json = await res.json();
      if (Array.isArray(json.data)) setAdstirData(json.data);
    } catch (err) {
      console.error('Error fetching AdStir data:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchDeliveryData(true), fetchAdstirData(true)]);
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchDeliveryData, fetchAdstirData]);

  useEffect(() => {
    fetchDeliveryData();
    fetchAdstirData();
    setLastUpdated(new Date());
    const interval = setInterval(() => {
      fetchDeliveryData(true);
      fetchAdstirData(true);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDeliveryData, fetchAdstirData]);

  // Aggregate reach (unique impressions) per campaign name from AdStir daily data
  const reachByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of adstirData) {
      map.set(r.campaign, (map.get(r.campaign) || 0) + (r.uniqueImpressions || 0));
    }
    return map;
  }, [adstirData]);

  const campaignOptions = useMemo(
    () =>
      Array.from(new Set(deliveryData.map(c => c.campaign)))
        .sort((a, b) => a.localeCompare(b)),
    [deliveryData]
  );

  const flightFilterActive = Boolean(flightDateRange.start || flightDateRange.end);

  const filteredDeliveryData = useMemo(() => {
    if (!flightFilterActive) return deliveryData;
    const start = flightDateRange.start ? toDateOnly(flightDateRange.start) : -Infinity;
    const end = flightDateRange.end ? toDateOnly(flightDateRange.end) : Infinity;

    return deliveryData.filter(c => {
      const flightStart = toDateOnly(c.flightStart);
      if (isNaN(flightStart)) return false;
      return flightStart >= start && flightStart <= end;
    });
  }, [deliveryData, flightDateRange, flightFilterActive]);

  const availableFlightStarts = useMemo(() => {
    return Array.from(new Set(deliveryData.map(c => formatDateForInput(c.flightStart)).filter(Boolean))).sort();
  }, [deliveryData]);

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-white border-b border-[#E2E8F0] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-[#2D3748] mb-1">CTV Dashboard</h1>
            <div className="w-48 h-0.5 mt-1" style={{ backgroundColor: brand.primaryColor }} />
          </div>
          <div className="flex items-center gap-6">
            {lastUpdated && (
              <span className="text-xs text-[#718096]">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button
              onClick={exportPdf}
              disabled={isExporting || deliveryLoading}
              className="px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {isExporting ? 'Generating PDF...' : 'Download PDF'}
            </button>
            <button
              onClick={refreshAll}
              disabled={isRefreshing}
              className="px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <div ref={reportRef} className="p-6 space-y-6 max-w-[1600px] mx-auto bg-[#F7F8FA]">
        <PdfHeader
          brand={brand}
          title="CTV Dashboard Report"
          subtitle={
            selectedCampaigns.size === 0
              ? `All campaigns (${campaignOptions.length})`
              : selectedCampaigns.has('__none__')
              ? 'No campaigns selected'
              : `${selectedCampaigns.size} campaign${selectedCampaigns.size === 1 ? '' : 's'} selected`
          }
        />

        <div className="bg-white border border-[#E2E8F0]">
          <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-medium" style={{ color: brand.primaryColor }}>Delivery Analysis</h2>
              <p className="text-xs text-[#718096] mt-0.5">
                {deliveryEmailDate
                  ? `Source: Daily Impression Network Report · ${new Date(deliveryEmailDate).toLocaleDateString()}`
                  : 'Source: Daily Impression Network Report'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#A0AEC0] text-right">Campaigns:</label>
                <PublisherMultiSelect
                  options={campaignOptions}
                  selected={selectedCampaigns}
                  onChange={setSelectedCampaigns}
                  accentColor={brand.primaryColor}
                  disabled={deliveryLoading || campaignOptions.length === 0}
                  entityLabel="campaign"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <label className="text-xs text-[#A0AEC0] text-right">Flight Start:</label>
                <input
                  type="date"
                  value={flightDateRange.start}
                  onChange={e => setFlightDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-2 py-1.5 text-xs border border-[#E2E8F0] focus:outline-none focus:border-[#CBD5E0]"
                  disabled={deliveryLoading || availableFlightStarts.length === 0}
                />
                <span className="text-xs text-[#A0AEC0]">to</span>
                <input
                  type="date"
                  value={flightDateRange.end}
                  onChange={e => setFlightDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-2 py-1.5 text-xs border border-[#E2E8F0] focus:outline-none focus:border-[#CBD5E0]"
                  disabled={deliveryLoading || availableFlightStarts.length === 0}
                />
                {flightFilterActive && (
                  <button
                    onClick={() => setFlightDateRange({ start: '', end: '' })}
                    className="text-xs text-[#718096] hover:text-[#2D3748] underline"
                  >
                    Clear dates
                  </button>
                )}
              </div>
              {flightFilterActive && (
                <p className="text-[10px] text-[#A0AEC0] max-w-[520px] text-right">
                  Flight date filters apply to impressions, publisher delivery, completed views, clicks, and ZIP delivery. Reach and frequency remain campaign-wide.
                </p>
              )}
            </div>
          </div>
        </div>

        <PublisherNetworkDelivery
          campaigns={filteredDeliveryData}
          selectedCampaigns={selectedCampaigns}
          accentColor={brand.primaryColor}
          loading={deliveryLoading}
          reachByCampaign={reachByCampaign}
          campaignWideCampaigns={deliveryData}
          flightFilterActive={flightFilterActive}
        />

        <ZipHeatmap
          campaigns={filteredDeliveryData}
          selectedCampaigns={selectedCampaigns}
          accentColor={brand.primaryColor}
          loading={deliveryLoading}
        />
      </div>
    </div>
  );
}
