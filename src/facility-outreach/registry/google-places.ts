import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

/**
 * Google Maps links for every listed facility, so patients can read reviews and get directions in
 * the app they already use.
 *
 * Google's terms let us keep only the place ID, so that is all we store. We look it up with a
 * Text Search that asks for IDs only (Google's free "IDs only" tier), restricted to a small box
 * around the registry's coordinates, so a match is the same building, not a namesake across town.
 * Without an API key, the links still work: they search Google Maps for the name and area.
 */
export function mapsLinks(f: { displayName: string; city?: string | null; stateOrRegion?: string | null; latitude?: number | null; longitude?: number | null; googlePlaceId?: string | null }) {
  const area = [f.displayName, f.city, f.stateOrRegion].filter(Boolean).join(', ');
  const q = encodeURIComponent(area);
  const id = f.googlePlaceId ? encodeURIComponent(f.googlePlaceId) : null;
  const hasPoint = typeof f.latitude === 'number' && typeof f.longitude === 'number';
  return {
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}${id ? `&query_place_id=${id}` : ''}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${hasPoint ? `${round6(f.latitude!)},${round6(f.longitude!)}` : q}${id ? `&destination_place_id=${id}` : ''}`,
    onGoogle: Boolean(id),
  };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** About 250 m either side of the point. */
const BOX_DEG = 0.0025;

@Injectable()
export class GooglePlaceMatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GooglePlaceMatcher.name);
  private interval: NodeJS.Timeout | null = null;
  private busy = false;
  fetchImpl: typeof fetch = fetch;

  constructor(private readonly dataSource: DataSource, @Optional() private readonly config?: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config?.get<string>('GOOGLE_PLACES_API_KEY') || undefined;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.interval = setInterval(() => {
      this.matchBatch().catch((e) => this.logger.warn(`Place matching failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, 60 * 60_000);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  /**
   * Match the next batch: facilities that have joined first, then the ones patients ask about,
   * then hospitals before smaller clinics. Each facility is tried at most once every 90 days.
   */
  async matchBatch(limit = Number(this.config?.get('GOOGLE_PLACES_HOURLY_LIMIT') ?? 200)): Promise<{ checked: number; matched: number }> {
    if (!this.apiKey || this.busy) return { checked: 0, matched: 0 };
    this.busy = true;
    try {
      const rows: { id: string; name: string; lat: number; lng: number }[] = await this.dataSource.query(
        `SELECT l.id, l.display_name AS name, l.latitude AS lat, l.longitude AS lng
         FROM partner_facility_listings l
         LEFT JOIN (SELECT listing_id, COUNT(*)::int AS n FROM partner_facility_interests GROUP BY listing_id) d ON d.listing_id = l.id
         WHERE l.active AND l.google_place_id IS NULL AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
           AND (l.google_checked_at IS NULL OR l.google_checked_at < now() - interval '90 days')
         ORDER BY (l.provider_id IS NOT NULL) DESC, COALESCE(d.n, 0) DESC,
           CASE WHEN l.level_of_care ILIKE 'tertiary%' THEN 0 WHEN l.level_of_care ILIKE 'secondary%' THEN 1 ELSE 2 END, l.display_name
         LIMIT $1`,
        [Math.max(1, Math.min(limit, 1000))],
      );
      let matched = 0;
      for (const r of rows) {
        const placeId = await this.find(r.name, Number(r.lat), Number(r.lng)).catch(() => undefined);
        if (placeId === undefined) continue; // network trouble: try again next hour
        await this.dataSource.query('UPDATE partner_facility_listings SET google_place_id = $2, google_checked_at = now() WHERE id = $1', [r.id, placeId]);
        if (placeId) matched += 1;
      }
      return { checked: rows.length, matched };
    } finally {
      this.busy = false;
    }
  }

  /** The place ID of the facility at this point, or null when Google has nothing there. */
  async find(name: string, lat: number, lng: number): Promise<string | null> {
    const res = await this.fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.apiKey!, 'X-Goog-FieldMask': 'places.id' },
      body: JSON.stringify({
        textQuery: name,
        pageSize: 1,
        locationRestriction: { rectangle: { low: { latitude: lat - BOX_DEG, longitude: lng - BOX_DEG }, high: { latitude: lat + BOX_DEG, longitude: lng + BOX_DEG } } },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const body = (await res.json()) as { places?: { id?: string }[] };
    const id = body.places?.[0]?.id;
    return typeof id === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(id) ? id : null;
  }
}
