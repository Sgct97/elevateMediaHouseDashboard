import { NextRequest, NextResponse } from 'next/server';

interface GeoJsonFeature {
  type: 'Feature';
  properties?: Record<string, unknown>;
  geometry?: unknown;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

const TIGER_ZCTA_QUERY_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11/query';
const CHUNK_SIZE = 75;

const featureCache = new Map<string, GeoJsonFeature | null>();

function normalizeZip(zip: unknown): string | null {
  const raw = String(zip ?? '').trim();
  const digits = raw.match(/\d{5}/)?.[0];
  return digits || null;
}

function getFeatureZip(feature: GeoJsonFeature): string | null {
  const props = feature.properties || {};
  return normalizeZip(props.ZCTA5 || props.GEOID || props.BASENAME);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchZipFeatures(zips: string[]): Promise<void> {
  for (const group of chunk(zips, CHUNK_SIZE)) {
    const params = new URLSearchParams({
      where: `ZCTA5 IN (${group.map(z => `'${z}'`).join(',')})`,
      outFields: 'ZCTA5,GEOID,BASENAME,NAME',
      returnGeometry: 'true',
      f: 'geojson',
      outSR: '4326',
    });

    const response = await fetch(`${TIGER_ZCTA_QUERY_URL}?${params.toString()}`, {
      next: { revalidate: 7 * 24 * 60 * 60 },
    });

    if (!response.ok) {
      throw new Error(`Census ZCTA query failed: ${response.status}`);
    }

    const data = (await response.json()) as Partial<GeoJsonFeatureCollection>;
    const returned = new Set<string>();

    for (const feature of data.features || []) {
      if (feature?.type !== 'Feature') continue;
      const zip = getFeatureZip(feature);
      if (!zip) continue;
      returned.add(zip);
      featureCache.set(zip, feature);
    }

    for (const zip of group) {
      if (!returned.has(zip) && !featureCache.has(zip)) featureCache.set(zip, null);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { zips?: unknown[] };
    const zips = Array.from(
      new Set((body.zips || []).map(normalizeZip).filter((zip): zip is string => Boolean(zip)))
    ).sort();

    if (zips.length === 0) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }

    const missing = zips.filter(zip => !featureCache.has(zip));
    if (missing.length > 0) await fetchZipFeatures(missing);

    const features = zips
      .map(zip => featureCache.get(zip))
      .filter((feature): feature is GeoJsonFeature => Boolean(feature));

    return NextResponse.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('ZCTA boundary lookup failed:', error);
    return NextResponse.json(
      { error: 'Failed to load ZIP boundary data', type: 'FeatureCollection', features: [] },
      { status: 500 }
    );
  }
}
