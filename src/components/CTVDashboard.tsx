'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PublisherNetworkDelivery } from './PublisherNetworkDelivery';
import { ZipHeatmap } from './ZipHeatmap';
import { PublisherMultiSelect } from './PublisherMultiSelect';
import { BrandConfig } from '@/lib/brands';
import type { CampaignDelivery } from '@/app/api/adstir-delivery/route';
import type { AdStirRecord } from '@/app/api/adstir/route';

interface CTVDashboardProps {
  brand: BrandConfig;
}

export function CTVDashboard({ brand }: CTVDashboardProps) {
  const [deliveryData, setDeliveryData] = useState<CampaignDelivery[]>([]);
  const [deliveryEmailDate, setDeliveryEmailDate] = useState<string>('');
  const [selectedDeliveryCampaign, setSelectedDeliveryCampaign] = useState<string>('');
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [adstirData, setAdstirData] = useState<AdStirRecord[]>([]);
  const [selectedPublishers, setSelectedPublishers] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDeliveryData = useCallback(async (refresh = false) => {
    try {
      const url = refresh ? '/api/adstir-delivery?refresh=true' : '/api/adstir-delivery';
      const res = await fetch(url);
      const json = await res.json();
      if (Array.isArray(json.campaigns)) {
        setDeliveryData(json.campaigns);
        setDeliveryEmailDate(json.emailDate || '');
        if (json.campaigns.length > 0 && !selectedDeliveryCampaign) {
          setSelectedDeliveryCampaign(json.campaigns[0].campaign);
        }
      }
    } catch (err) {
      console.error('Error fetching delivery data:', err);
    } finally {
      setDeliveryLoading(false);
    }
  }, [selectedDeliveryCampaign]);

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
      deliveryData
        .map(c => ({ value: c.campaign, label: `${c.advertiser ? c.advertiser + ' — ' : ''}${c.campaign}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [deliveryData]
  );

  const activeCampaign = useMemo(
    () => deliveryData.find(c => c.campaign === selectedDeliveryCampaign),
    [deliveryData, selectedDeliveryCampaign]
  );

  const publisherOptions = useMemo(
    () => (activeCampaign ? activeCampaign.publishers.map(p => p.publisher).sort((a, b) => a.localeCompare(b)) : []),
    [activeCampaign]
  );

  // Reset publisher selection when campaign changes
  useEffect(() => {
    setSelectedPublishers(new Set());
  }, [selectedDeliveryCampaign]);

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

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
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
                <label className="text-xs text-[#A0AEC0] w-[80px] text-right">Campaign:</label>
                <select
                  value={selectedDeliveryCampaign}
                  onChange={e => setSelectedDeliveryCampaign(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-[#E2E8F0] focus:outline-none focus:border-[#CBD5E0] min-w-[320px] max-w-[480px]"
                  disabled={deliveryLoading || campaignOptions.length === 0}
                >
                  {campaignOptions.length === 0 && <option>Loading campaigns...</option>}
                  {campaignOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#A0AEC0] w-[80px] text-right">Publishers:</label>
                <PublisherMultiSelect
                  options={publisherOptions}
                  selected={selectedPublishers}
                  onChange={setSelectedPublishers}
                  accentColor={brand.primaryColor}
                  disabled={deliveryLoading || publisherOptions.length === 0}
                />
              </div>
            </div>
          </div>
        </div>

        <PublisherNetworkDelivery
          campaigns={deliveryData}
          selectedCampaign={selectedDeliveryCampaign}
          accentColor={brand.primaryColor}
          loading={deliveryLoading}
          reachByCampaign={reachByCampaign}
          selectedPublishers={selectedPublishers}
        />

        <ZipHeatmap
          campaigns={deliveryData}
          selectedCampaign={selectedDeliveryCampaign}
          accentColor={brand.primaryColor}
          loading={deliveryLoading}
        />
      </div>
    </div>
  );
}
