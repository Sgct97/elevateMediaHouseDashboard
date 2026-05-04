'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { CampaignDelivery, ZipAggregate } from '@/app/api/adstir-delivery/route';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

type MapMode = 'dots' | 'boundaries';

interface BoundaryProperties {
  ZCTA5?: string;
  GEOID?: string;
  BASENAME?: string;
  metrics?: ZipAggregate;
}

type BoundaryFeature = Feature<Geometry, BoundaryProperties>;
type BoundaryFeatureCollection = FeatureCollection<Geometry, BoundaryProperties>;

interface Props {
  campaigns: CampaignDelivery[];
  selectedCampaigns: Set<string>;
  accentColor: string;
  loading: boolean;
}

const NONE_SENTINEL = '__none__';
const BOUNDARY_RENDER_LIMIT = 250;

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const bigint = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

export function ZipHeatmap({ campaigns, selectedCampaigns, accentColor, loading }: Props) {
  const [mapMode, setMapMode] = useState<MapMode>('dots');
  const [leafletReady, setLeafletReady] = useState(false);
  const [boundaryData, setBoundaryData] = useState<BoundaryFeatureCollection | null>(null);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState('');

  useEffect(() => {
    // @ts-expect-error - CSS module has no type declarations
    import('leaflet/dist/leaflet.css').then(() => setLeafletReady(true));
  }, []);

  const activeCampaigns = useMemo<CampaignDelivery[]>(() => {
    if (selectedCampaigns.size === 0) return campaigns;
    if (selectedCampaigns.has(NONE_SENTINEL)) return [];
    return campaigns.filter(c => selectedCampaigns.has(c.campaign));
  }, [campaigns, selectedCampaigns]);

  // Aggregate zips across all active campaigns, summing metrics by zip code.
  // Preserve the first non-null lat/lng/city/state we encounter.
  const aggregatedZips = useMemo<ZipAggregate[]>(() => {
    if (activeCampaigns.length === 0) return [];
    const acc = new Map<string, ZipAggregate>();
    for (const camp of activeCampaigns) {
      for (const z of camp.zips) {
        const existing = acc.get(z.zip);
        if (existing) {
          existing.impressions += z.impressions;
          existing.completedViews += z.completedViews;
          existing.clicks += z.clicks;
          if (existing.lat == null && z.lat != null) existing.lat = z.lat;
          if (existing.lng == null && z.lng != null) existing.lng = z.lng;
          if (!existing.city && z.city) existing.city = z.city;
          if (!existing.state && z.state) existing.state = z.state;
        } else {
          acc.set(z.zip, {
            zip: z.zip,
            impressions: z.impressions,
            completedViews: z.completedViews,
            clicks: z.clicks,
            lat: z.lat,
            lng: z.lng,
            city: z.city,
            state: z.state,
          });
        }
      }
    }
    return Array.from(acc.values());
  }, [activeCampaigns]);

  const plottableZips = useMemo(() => {
    return aggregatedZips.filter(z => z.lat != null && z.lng != null && z.impressions > 0);
  }, [aggregatedZips]);

  const boundaryZips = useMemo(() => {
    return [...plottableZips]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, BOUNDARY_RENDER_LIMIT);
  }, [plottableZips]);

  const boundaryRequestKey = useMemo(
    () => boundaryZips.map(z => z.zip).sort().join(','),
    [boundaryZips]
  );

  const zipMetricsByCode = useMemo(() => {
    const map = new Map<string, ZipAggregate>();
    for (const zip of boundaryZips) map.set(zip.zip, zip);
    return map;
  }, [boundaryZips]);

  useEffect(() => {
    if (mapMode !== 'boundaries' || boundaryRequestKey.length === 0) return;

    const controller = new AbortController();
    setBoundaryLoading(true);
    setBoundaryError('');

    fetch('/api/zcta-boundaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zips: boundaryRequestKey.split(',') }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`Boundary lookup failed: ${res.status}`);
        return res.json();
      })
      .then((data: BoundaryFeatureCollection) => setBoundaryData(data))
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Boundary lookup failed:', err);
        setBoundaryError('ZIP boundaries could not be loaded.');
        setBoundaryData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBoundaryLoading(false);
      });

    return () => controller.abort();
  }, [mapMode, boundaryRequestKey]);

  const boundaryGeoJson = useMemo<BoundaryFeatureCollection>(() => {
    const features = (boundaryData?.features || [])
      .map(feature => {
        const props = feature.properties || {};
        const zip = props.ZCTA5 || props.GEOID || props.BASENAME || '';
        const metrics = zipMetricsByCode.get(zip);
        if (!metrics || metrics.impressions <= 0) return null;
        return {
          ...feature,
          properties: { ...props, metrics },
        } as BoundaryFeature;
      })
      .filter((feature): feature is BoundaryFeature => Boolean(feature));

    return { type: 'FeatureCollection', features };
  }, [boundaryData, zipMetricsByCode]);

  const maxValue = useMemo(
    () => plottableZips.reduce((m, z) => Math.max(m, z.impressions), 0) || 1,
    [plottableZips]
  );

  const [r, g, b] = useMemo(() => hexToRgb(accentColor), [accentColor]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (plottableZips.length === 0) return [39.8283, -98.5795];
    const latSum = plottableZips.reduce((s, z) => s + (z.lat || 0), 0);
    const lngSum = plottableZips.reduce((s, z) => s + (z.lng || 0), 0);
    return [latSum / plottableZips.length, lngSum / plottableZips.length];
  }, [plottableZips]);

  const totalForMetric = useMemo(
    () => plottableZips.reduce((s, z) => s + z.impressions, 0),
    [plottableZips]
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
          {activeCampaigns.length > 0 && (
            <p className="text-xs text-[#718096] mt-0.5">
              {activeCampaigns.length === 1
                ? activeCampaigns[0].campaign
                : selectedCampaigns.size === 0
                ? `All campaigns (${activeCampaigns.length})`
                : `${activeCampaigns.length} campaigns selected`}
              {' · '}{plottableZips.length.toLocaleString()} zip codes · {totalForMetric.toLocaleString()} impressions
              {mapMode === 'boundaries' && plottableZips.length > BOUNDARY_RENDER_LIMIT
                ? ` · ZIP Borders showing top ${BOUNDARY_RENDER_LIMIT.toLocaleString()} by impressions`
                : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#A0AEC0] mr-1">View:</span>
            {(['dots', 'boundaries'] as MapMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setMapMode(mode)}
                className="px-2.5 py-1 border transition-colors"
                style={{
                  borderColor: mapMode === mode ? accentColor : '#E2E8F0',
                  color: mapMode === mode ? accentColor : '#718096',
                  backgroundColor: mapMode === mode ? `${accentColor}10` : 'white',
                }}
              >
                {mode === 'dots' ? 'Dots' : 'ZIP Borders'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: 520 }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Loading delivery data...</div>
        ) : activeCampaigns.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Select one or more campaigns to view the geographic heatmap.</div>
        ) : plottableZips.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">No geographic data for the selected campaign(s).</div>
        ) : mapMode === 'boundaries' && boundaryLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Loading ZIP boundaries...</div>
        ) : mapMode === 'boundaries' && boundaryError ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">{boundaryError}</div>
        ) : mapMode === 'boundaries' && boundaryGeoJson.features.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">No ZIP boundaries found for the selected campaign(s).</div>
        ) : leafletReady ? (
          <MapContainer
            key={`${mapMode}-${boundaryRequestKey}`}
            center={mapCenter}
            zoom={plottableZips.length > 500 ? 4 : 6}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {mapMode === 'boundaries' ? (
              <GeoJSON
                key={boundaryRequestKey}
                data={boundaryGeoJson}
                style={(feature) => {
                  const z = feature?.properties?.metrics;
                  const intensity = z ? z.impressions / maxValue : 0;
                  return {
                    color: `rgba(${r},${g},${b},0.9)`,
                    weight: 1.25,
                    fillColor: `rgba(${r},${g},${b},${0.18 + intensity * 0.62})`,
                    fillOpacity: 0.8,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const z = feature.properties?.metrics;
                  if (!z) return;
                  layer.bindTooltip(
                    `<div>${z.impressions.toLocaleString()}</div>`,
                    {
                      permanent: true,
                      direction: 'center',
                      className: 'zcta-metric-label',
                    }
                  );
                }}
              />
            ) : (
              plottableZips.map(z => {
                const intensity = z.impressions / maxValue;
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
                          {z.impressions.toLocaleString()} impressions
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })
            )}
          </MapContainer>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0AEC0]">Loading map...</div>
        )}
      </div>

      {activeCampaigns.length > 0 && plottableZips.length > 0 && (
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
          {mapMode === 'boundaries' && plottableZips.length > BOUNDARY_RENDER_LIMIT && (
            <span className="text-[10px] text-[#A0AEC0] ml-auto">
              Showing top {BOUNDARY_RENDER_LIMIT.toLocaleString()} of {plottableZips.length.toLocaleString()} ZIPs for stability.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
