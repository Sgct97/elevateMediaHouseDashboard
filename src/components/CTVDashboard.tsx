'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PacingReport } from './PacingReport';
import { PublisherNetworkDelivery } from './PublisherNetworkDelivery';
import { ZipHeatmap } from './ZipHeatmap';
import { BrandConfig } from '@/lib/brands';
import type { PacingRecord } from '@/app/api/pacing/route';
import type { CampaignDelivery } from '@/app/api/adstir-delivery/route';

interface CTVDashboardProps {
  brand: BrandConfig;
}

export function CTVDashboard({ brand }: CTVDashboardProps) {
  const [pacingData, setPacingData] = useState<PacingRecord[]>([]);
  const [deliveryData, setDeliveryData] = useState<CampaignDelivery[]>([]);
  const [deliveryEmailDate, setDeliveryEmailDate] = useState<string>('');
  const [selectedDeliveryCampaign, setSelectedDeliveryCampaign] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPacingData = useCallback(async (refresh = false) => {
    try {
      const url = refresh ? '/api/pacing?refresh=true' : '/api/pacing';
      const res = await fetch(url);
      const json = await res.json();
      if (json.data) setPacingData(json.data);
    } catch (err) {
      console.error('Error fetching pacing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchPacingData(true), fetchDeliveryData(true)]);
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchPacingData, fetchDeliveryData]);

  useEffect(() => {
    fetchPacingData();
    fetchDeliveryData();
    setLastUpdated(new Date());
    const interval = setInterval(() => {
      fetchPacingData(true);
      fetchDeliveryData(true);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPacingData, fetchDeliveryData]);

  const campaignOptions = useMemo(
    () => deliveryData.map(c => ({ value: c.campaign, label: `${c.advertiser ? c.advertiser + ' — ' : ''}${c.campaign}` })),
    [deliveryData]
  );

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
        <PacingReport data={pacingData} loading={loading} accentColor={brand.primaryColor} />

        <div className="bg-white border border-[#E2E8F0]">
          <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-medium" style={{ color: brand.primaryColor }}>Delivery Analysis</h2>
              <p className="text-xs text-[#718096] mt-0.5">
                {deliveryEmailDate
                  ? `Source: Daily Impression Network Report · ${new Date(deliveryEmailDate).toLocaleDateString()}`
                  : 'Source: Daily Impression Network Report'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#A0AEC0]">Campaign:</label>
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
          </div>
        </div>

        <PublisherNetworkDelivery
          campaigns={deliveryData}
          selectedCampaign={selectedDeliveryCampaign}
          accentColor={brand.primaryColor}
          loading={deliveryLoading}
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
