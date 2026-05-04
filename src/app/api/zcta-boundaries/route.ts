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
const MAX_ZIPS_PER_REQUEST = 250;
const CHUNK_SIZE = 25;
const CENSUS_TIMEOUT_MS = 8000;
const FEATURE_CACHE_LIMIT = 750;

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

function rememberFeature(zip: string, feature: GeoJsonFeature | null) {
  if (featureCache.has(zip)) featureCache.delete(zip);
  featureCache.set(zip, feature);

  while (featureCache.size > FEATURE_CACHE_LIMIT) {
    const oldestKey = featureCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    featureCache.delete(oldestKey);
  }
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CENSUS_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${TIGER_ZCTA_QUERY_URL}?${params.toString()}`, {
        signal: controller.signal,
        next: { revalidate: 7 * 24 * 60 * 60 },
      });
    } catch (error) {
      console.error('[ZCTA] Census query failed for chunk:', error);
      for (const zip of group) {
        if (!featureCache.has(zip)) rememberFeature(zip, null);
      }
      clearTimeout(timeout);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error(`[ZCTA] Census query returned ${response.status}`);
      for (const zip of group) {
        if (!featureCache.has(zip)) rememberFeature(zip, null);
      }
      continue;
    }

    const data = (await response.json()) as Partial<GeoJsonFeatureCollection>;
    const returned = new Set<string>();

    for (const feature of data.features || []) {
      if (feature?.type !== 'Feature') continue;
      const zip = getFeatureZip(feature);
      if (!zip) continue;
      returned.add(zip);
      rememberFeature(zip, feature);
    }

    for (const zip of group) {
      if (!returned.has(zip) && !featureCache.has(zip)) rememberFeature(zip, null);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { zips?: unknown[] };
    const requestedZips = Array.from(
      new Set((body.zips || []).map(normalizeZip).filter((zip): zip is string => Boolean(zip)))
    ).sort();
    const zips = requestedZips.slice(0, MAX_ZIPS_PER_REQUEST);

    if (zips.length === 0) {
      return NextResponse.json({ type: 'FeatureCollection', features: [], meta: { requested: 0, capped: false } });
    }

    const missing = zips.filter(zip => !featureCache.has(zip));
    if (missing.length > 0) await fetchZipFeatures(missing);

    const features = zips
      .map(zip => featureCache.get(zip))
      .filter((feature): feature is GeoJsonFeature => Boolean(feature));

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
      meta: {
        requested: requestedZips.length,
        returned: features.length,
        capped: requestedZips.length > MAX_ZIPS_PER_REQUEST,
        limit: MAX_ZIPS_PER_REQUEST,
      },
    });
  } catch (error) {
    console.error('ZCTA boundary lookup failed:', error);
    return NextResponse.json(
      { error: 'Failed to load ZIP boundary data', type: 'FeatureCollection', features: [] },
      { status: 500 }
    );
  }
}
