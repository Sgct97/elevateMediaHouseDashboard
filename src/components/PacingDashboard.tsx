'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from './Header';
import { GroundTruthPacing } from './GroundTruthPacing';
import { BrandConfig } from '@/lib/brands';
import type { PacingCampaign } from '@/app/api/groundtruth/pacing/route';

interface PacingDashboardProps {
  brand: BrandConfig;
}

export function PacingDashboard({ brand }: PacingDashboardProps) {
  const [gtPacingData, setGtPacingData] = useState<PacingCampaign[]>([]);
  const [gtPacingLoading, setGtPacingLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchGtPacingData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);
      setGtPacingLoading(true);
      const url = refresh ? '/api/groundtruth/pacing?refresh=true' : '/api/groundtruth/pacing';
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setGtPacingData(result.data || []);
        setLastUpdated(new Date());
      }
    } catch {
      // fail silently
    } finally {
      setGtPacingLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGtPacingData();
    const interval = setInterval(() => {
      fetchGtPacingData(true);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchGtPacingData]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFBFC' }}>
      <Header
        brand={brand}
        lastUpdated={lastUpdated}
        onRefresh={() => fetchGtPacingData(true)}
        isRefreshing={isRefreshing}
      />

      <main className="px-6 py-8 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light text-[#2D3748] mb-1">
              Pacing Report
            </h1>
            <div
              className="w-48 h-0.5 mt-2"
              style={{ backgroundColor: brand.primaryColor }}
            />
          </div>
        </div>

        <div className="space-y-6">
          <GroundTruthPacing
            data={gtPacingData}
            loading={gtPacingLoading}
            accentColor={brand.primaryColor}
          />
        </div>
      </main>
    </div>
  );
}
