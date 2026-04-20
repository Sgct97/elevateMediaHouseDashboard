'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { CampaignDelivery, ZipAggregate } from '@/app/api/adstir-delivery/route';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

type Metric = 'clicks' | 'impressions' | 'completedViews';

interface Props {
  campaigns: CampaignDelivery[];
  selectedCampaign: string;
  accentColor: string;
  loading: boolean;
}

const metricLabels: Record<Metric, string> = {
  clicks: 'Clicks',
  impressions: 'Impressions',
  completedViews: 'Completed Views',
};

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const bigint = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

export function ZipHeatmap({ campaigns, selectedCampaign, accentColor, loading }: Props) {
  const [metric, setMetric] = useState<Metric>('clicks');
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    import('leaflet/dist/leaflet.css').then(() => setLeafletReady(true));
  }, []);

  const activeCampaign = useMemo(
    () => campaigns.find(c => c.campaign === selectedCampaign),
    [campaigns, selectedCampaign]
  );

  const plottableZips = useMemo(() => {
    if (!activeCampaign) return [] as ZipAggregate[];
    return activeCampaign.zips.filter(z => z.lat != null && z.lng != null && z[metric] > 0);
  }, [activeCampaign, metric]);

  const maxValue = useMemo(
    () => plottableZips.reduce((m, z) => Math.max(m, z[metric]), 0) || 1,
    [plottableZips, metric]
  );

  const [r, g, b] = useMemo(() => hexToRgb(accentColor), [accentColor]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (plottableZips.length === 0) return [39.8283, -98.5795];
    const latSum = plottableZips.reduce((s, z) => s + (z.lat || 0), 0);
    const lngSum = plottableZips.reduce((s, z) => s + (z.lng || 0), 0);
    return [latSum / plottableZips.length, lngSum / plottableZips.length];
  }, [plottableZips]);

  const totalForMetric = useMemo(
    () => plottableZips.reduce((s, z) => s + z[metric], 0),
    [plottableZips, metric]
  );

  function legendStops() {
    return [0.2, 0.4, 0.6, 0.8, 1].map(t => ({
      t,
      color: `rgba(${r},${g},${b},${0.2 + t * 0.6})`,
      label: Math.round(maxValue * t).toLocaleString(),
    }));
  }

  return (
    <div className="bg-white border border-[#E2E8F0]">
      <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium" style={{ color: accentColor }}>
            Geographic Delivery Heatmap
          </h3>
          {activeCampaign && (
            <p className="text-xs text-[#718096] mt-0.5">
              {activeCampaign.campaign} · {plottableZips.length.toLocaleString()} zip codes · {totalForMetric.toLocaleString()} {metricLabels[metric].toLowerCase()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-[#A0AEC0] mr-1">Metric:</span>
          {(['clicks', 'impressions', 'completedViews'] as Metric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="px-2.5 py-1 border transition-colors"
              style={{
                borderColor: metric === m ? accentColor : '#E2E8F0',
                color: metric === m ? accentColor : '#718096',
                backgroundColor: metric === m ? `${accentColor}10` : 'white',
              }}
            >
              {metricLabels[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: 520 }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Loading delivery data...</div>
        ) : !activeCampaign ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Select a campaign to view the geographic heatmap.</div>
        ) : plottableZips.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">No geographic data for this campaign.</div>
        ) : leafletReady ? (
          <MapContainer
            center={mapCenter}
            zoom={plottableZips.length > 500 ? 4 : 6}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {plottableZips.map(z => {
              const intensity = z[metric] / maxValue;
              const radius = 4 + Math.sqrt(intensity) * 14;
              const fill = `rgba(${r},${g},${b},${0.25 + intensity * 0.55})`;
              const stroke = `rgba(${r},${g},${b},${0.6 + intensity * 0.4})`;
              return (
                <CircleMarker
                  key={z.zip}
                  center={[z.lat!, z.lng!]}
                  radius={radius}
                  pathOptions={{ color: stroke, fillColor: fill, fillOpacity: 1, weight: 1 }}
                >
                  <Tooltip direction="top" offset={[0, -4]}>
                    <div className="text-xs">
                      <div className="font-medium text-[#2D3748]">
                        {z.zip}{z.city ? ` · ${z.city}, ${z.state}` : ''}
                      </div>
                      <div className="text-[#718096] mt-0.5">
                        {z.impressions.toLocaleString()} imp · {z.clicks.toLocaleString()} clicks · {z.completedViews.toLocaleString()} CV
                      </div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Loading map...</div>
        )}
      </div>

      {activeCampaign && plottableZips.length > 0 && (
        <div className="px-6 py-3 border-t border-[#E2E8F0] flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-[#A0AEC0]">Intensity</span>
          <div className="flex items-center gap-2">
            {legendStops().map(s => (
              <div key={s.t} className="flex items-center gap-1">
                <div className="w-3 h-3 border border-[#E2E8F0]" style={{ backgroundColor: s.color }} />
                <span className="text-[10px] text-[#718096] tabular-nums">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
