'use client';

import { useState, useEffect, useCallback } from 'react';
import { PacingReport } from './PacingReport';
import { BrandConfig } from '@/lib/brands';
import type { PacingRecord } from '@/app/api/pacing/route';

interface CTVDashboardProps {
  brand: BrandConfig;
}

export function CTVDashboard({ brand }: CTVDashboardProps) {
  const [pacingData, setPacingData] = useState<PacingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPacingData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);
      const url = refresh ? '/api/pacing?refresh=true' : '/api/pacing';
      const res = await fetch(url);
      const json = await res.json();
      if (json.data) {
        setPacingData(json.data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error fetching pacing data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPacingData();
    const interval = setInterval(() => fetchPacingData(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPacingData]);

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-white border-b border-[#E2E8F0] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-[#2D3748] mb-1">
              CTV Dashboard
            </h1>
            <div
              className="w-48 h-0.5 mt-1"
              style={{ backgroundColor: brand.primaryColor }}
            />
          </div>
          <div className="flex items-center gap-6">
            {lastUpdated && (
              <span className="text-xs text-[#718096]">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchPacingData(true)}
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
        <PacingReport
          data={pacingData}
          loading={loading}
          accentColor={brand.primaryColor}
        />
      </div>
    </div>
  );
}
