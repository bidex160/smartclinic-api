import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Repository } from 'typeorm';

import { PartnerFacilityListing, PartnerFacilityReadiness, PartnerFacilityType } from '../../patient-provider-connections/entities/partner-facility-listing.entity';
import { FacilityOutreach, FacilityOutreachEvent, OutreachEventKind, OutreachStatus } from '../outreach.entities';
import { normalizePhone, normalizeState } from '../places';
import { FacilityRegistryClient, isOperational, isRegistryVerified, REGISTRY_KINDS, RegistryError, RegistryFacility, RegistryKind } from './hfr-client';
import { FacilityRegistrySync } from './registry-sync.entity';

export const FACILITY_REGISTRY_CLIENT = Symbol('FACILITY_REGISTRY_CLIENT');
export const NHFR_SOURCE = 'NHFR';
const COUNTRY = 'NG';
const PER_PAGE = 100;
const SCHEDULER_MS = 60 * 60_000;
/** Run once a day, after 01:00 UTC (02:00 in Lagos), when the registry is quiet. */
const DAILY_AFTER_UTC_HOUR = 1;
const STALE_RUN_MS = 6 * 60 * 60_000;
const LOCK_KEY = 'smartclinic:facility-registry-sync';

export interface SyncCounts {
  [key: string]: number;
}

/**
 * Keeps our facility list in step with Nigeria's national Health Facility Registry, every night,
 * without anyone uploading spreadsheets: new facilities are added, details and licence status are
 * refreshed, and facilities the registry marks closed (or drops) stop showing to patients.
 * Facilities that have already joined SmartClinic are never hidden by the sync.
 */
@Injectable()
export class FacilityRegistrySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacilityRegistrySyncService.name);
  private interval: NodeJS.Timeout | null = null;
  private running: Promise<FacilityRegistrySync> | null = null;
  /** Gap between registry calls; the registry allows 60 a minute. */
  minIntervalMs = 1100;
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PartnerFacilityListing) private readonly listings: Repository<PartnerFacilityListing>,
    @InjectRepository(FacilityRegistrySync) private readonly syncs: Repository<FacilityRegistrySync>,
    @Optional() @Inject(FACILITY_REGISTRY_CLIENT) private readonly client?: FacilityRegistryClient,
    @Optional() private readonly config?: ConfigService,
  ) {}

  get configured(): boolean {
    return Boolean(this.client?.configured);
  }

  private get enabled(): boolean {
    return this.configured && this.config?.get('FACILITY_REGISTRY_SYNC_ENABLED') !== 'false';
  }

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.interval = setInterval(() => {
      this.runIfDue().catch((e) => this.logger.warn(`Registry sync check failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, SCHEDULER_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  /** Called hourly: start tonight's run if it hasn't happened yet. */
  async runIfDue(now = new Date()): Promise<boolean> {
    if (!this.enabled || this.running || now.getUTCHours() < DAILY_AFTER_UTC_HOUR) return false;
    const last = await this.syncs.findOne({ where: { source: NHFR_SOURCE, status: In(['SUCCEEDED', 'RUNNING']) }, order: { startedAt: 'DESC' } });
    if (last && now.getTime() - last.startedAt.getTime() < 20 * 60 * 60_000) return false;
    void this.start('SCHEDULE');
    return true;
  }

  /** Start a run in the background (or return the one already going). */
  start(triggeredBy: 'SCHEDULE' | 'STAFF'): Promise<FacilityRegistrySync> {
    if (!this.running) {
      this.running = this.run(triggeredBy).finally(() => { this.running = null; });
      this.running.catch(() => undefined);
    }
    return this.running;
  }

  get isRunning(): boolean {
    return Boolean(this.running);
  }

  async status() {
    const recent = await this.syncs.find({ where: { source: NHFR_SOURCE }, order: { startedAt: 'DESC' }, take: 10 });
    const [totals] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS listed,
        COUNT(*) FILTER (WHERE active)::int AS active,
        COUNT(*) FILTER (WHERE active AND registry_verified)::int AS "registryVerified",
        COUNT(*) FILTER (WHERE active AND (registry_phone IS NOT NULL OR registry_email IS NOT NULL))::int AS reachable,
        COUNT(*) FILTER (WHERE active AND latitude IS NOT NULL)::int AS "withLocation",
        COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS "onGoogle",
        COUNT(*) FILTER (WHERE provider_id IS NOT NULL)::int AS claimed
       FROM partner_facility_listings WHERE source = $1`,
      [NHFR_SOURCE],
    );
    const byType = await this.dataSource.query(
      `SELECT facility_type AS "facilityType", COUNT(*)::int AS n FROM partner_facility_listings WHERE source = $1 AND active GROUP BY 1 ORDER BY 2 DESC`,
      [NHFR_SOURCE],
    );
    return {
      source: NHFR_SOURCE,
      configured: this.configured,
      enabled: this.enabled,
      running: this.isRunning,
      totals,
      byType,
      recent: recent.map((s) => ({ id: s.id, status: s.status, startedAt: s.startedAt, finishedAt: s.finishedAt, counts: s.counts, error: s.error, triggeredBy: s.triggeredBy })),
    };
  }

  async run(triggeredBy: 'SCHEDULE' | 'STAFF' = 'SCHEDULE', kinds: readonly RegistryKind[] = REGISTRY_KINDS): Promise<FacilityRegistrySync> {
    // A run that died with the server is marked failed, so it doesn't block the next one forever.
    await this.syncs.update({ source: NHFR_SOURCE, status: 'RUNNING', startedAt: LessThan(new Date(Date.now() - STALE_RUN_MS)) }, { status: 'FAILED', error: 'INTERRUPTED', finishedAt: new Date() });
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const [{ locked }] = await runner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [LOCK_KEY]);
      if (!locked) throw new RegistryError('ALREADY_RUNNING');
      try {
        return await this.runLocked(triggeredBy, kinds);
      } finally {
        await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => undefined);
      }
    } finally {
      await runner.release();
    }
  }

  private async runLocked(triggeredBy: string, kinds: readonly RegistryKind[]): Promise<FacilityRegistrySync> {
    const startedAt = new Date();
    const sync = await this.syncs.save(this.syncs.create({ source: NHFR_SOURCE, status: 'RUNNING', startedAt, finishedAt: null, counts: {}, error: null, triggeredBy }));
    const counts: SyncCounts = { created: 0, updated: 0, unchanged: 0, closed: 0, reopened: 0, skipped: 0, pages: 0, removed: 0 };
    const completed: PartnerFacilityType[] = [];
    try {
      if (!this.client?.configured) throw new RegistryError('NOT_CONFIGURED');
      for (const kind of kinds) {
        let page = 1;
        let lastPage = 1;
        let seen = 0;
        do {
          const result = await this.fetchPage(kind, page);
          counts['pages'] += 1;
          if (page === 1 && result.total !== null) counts[`registry_${kind}`] = result.total;
          lastPage = result.lastPage;
          seen += result.items.length;
          await this.upsertPage(result.items, startedAt, counts);
          page += 1;
          if (counts['pages'] % 25 === 0) await this.syncs.update({ id: sync.id }, { counts: { ...counts } });
        } while (page <= lastPage);
        // Only trust "missing means gone" for a list we read to the end and that wasn't empty.
        if (seen > 0) completed.push(TYPE_OF[kind]);
      }
      if (completed.length) counts['removed'] = await this.retireMissing(startedAt, completed);
      sync.status = 'SUCCEEDED';
    } catch (e) {
      sync.status = 'FAILED';
      sync.error = e instanceof RegistryError ? e.code : 'UNEXPECTED';
      this.logger.warn(`Registry sync failed: ${sync.error}`);
    }
    sync.finishedAt = new Date();
    sync.counts = counts;
    return this.syncs.save(sync);
  }

  private lastCallAt = 0;

  private async fetchPage(kind: RegistryKind, page: number) {
    for (let attempt = 1; ; attempt += 1) {
      const wait = this.lastCallAt + this.minIntervalMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastCallAt = Date.now();
      try {
        return await this.client!.list(kind, page, PER_PAGE);
      } catch (e) {
        const err = e instanceof RegistryError ? e : new RegistryError('UNEXPECTED');
        const retriable = err.code === 'RATE_LIMITED' || err.code === 'NETWORK' || /^HTTP_5\d\d$/.test(err.code);
        if (!retriable || attempt >= 5) throw err;
        await this.sleep(err.retryAfterMs ?? Math.min(60_000, 2_000 * 2 ** attempt));
      }
    }
  }

  /** Add or refresh one page of registry facilities. */
  async upsertPage(items: readonly RegistryFacility[], seenAt: Date, counts: SyncCounts): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PartnerFacilityListing);
      const outreachRepo = manager.getRepository(FacilityOutreach);
      const refs = [...new Set(items.map((i) => i.ref))];
      const existing = new Map((await repo.find({ where: { source: NHFR_SOURCE, sourceReference: In(refs) } })).map((l) => [l.sourceReference, l]));
      const events: { listingId: string; kind: OutreachEventKind; note: string; byUserId: null }[] = [];
      for (const f of items) {
        let listing = existing.get(f.ref) ?? null;
        const state = normalizeState(COUNTRY, f.state);
        const city = f.lga ?? null;
        const isNew = !listing;
        if (!listing) {
          // A facility someone added earlier by hand: adopt it, rather than listing it twice.
          listing = await repo.createQueryBuilder('l')
            .where('l.source <> :src', { src: NHFR_SOURCE })
            .andWhere('l.registrySeenAt IS NULL')
            .andWhere('l.countryCode = :cc', { cc: COUNTRY })
            .andWhere('l.facilityType = :type', { type: f.facilityType })
            .andWhere('LOWER(l.displayName) = LOWER(:name)', { name: f.name })
            .andWhere("COALESCE(LOWER(l.stateOrRegion), '') = COALESCE(LOWER(:state), '')", { state })
            .getOne();
          if (listing) { listing.source = NHFR_SOURCE; listing.sourceReference = f.ref; }
        }
        const operational = isOperational(f);
        const verified = isRegistryVerified(f);
        const phone = normalizePhone(COUNTRY, f.phone);
        const next: Partial<PartnerFacilityListing> = {
          displayName: f.name, facilityType: f.facilityType, countryCode: COUNTRY, stateOrRegion: state, city, lga: f.lga,
          address: f.address, latitude: f.latitude, longitude: f.longitude, levelOfCare: f.level?.slice(0, 60) ?? null, ownership: f.ownership?.slice(0, 60) ?? null,
          registryUniqueId: f.uniqueId?.slice(0, 80) ?? null, operationalStatus: f.operationalStatus?.slice(0, 60) ?? null,
          registrationStatus: f.registrationStatus?.slice(0, 60) ?? null, licenceStatus: f.licenceStatus?.slice(0, 60) ?? null,
          accreditationStatus: f.accreditationStatus?.slice(0, 60) ?? null, registryVerified: verified, registryPhone: phone, registryEmail: f.email,
        };
        if (!listing) {
          listing = repo.create({ ...next, source: NHFR_SOURCE, sourceReference: f.ref, readiness: PartnerFacilityReadiness.AVAILABLE_TO_JOIN, providerId: null, active: operational, sourceVerifiedAt: seenAt, registrySeenAt: seenAt, googlePlaceId: null, googleCheckedAt: null });
          listing = await repo.save(listing);
          counts['created'] += 1;
          events.push({ listingId: listing.id, kind: OutreachEventKind.IMPORTED, note: 'Added from the national Health Facility Registry', byUserId: null });
        } else {
          const before = JSON.stringify(pickKeys(listing, Object.keys(next)));
          const previousPhone = listing.registryPhone;
          const previousEmail = listing.registryEmail;
          const wasActive = listing.active;
          Object.assign(listing, next);
          // Joined facilities stay visible; their account status decides that.
          listing.active = operational || Boolean(listing.providerId);
          listing.registrySeenAt = seenAt;
          listing.sourceVerifiedAt = seenAt;
          await repo.save(listing);
          if (!wasActive && listing.active) counts['reopened'] += 1;
          else if (wasActive && !listing.active) counts['closed'] += 1;
          if (isNew) counts['updated'] += 1;
          else if (before === JSON.stringify(pickKeys(listing, Object.keys(next)))) counts['unchanged'] += 1;
          else counts['updated'] += 1;
          await this.refreshContacts(outreachRepo, listing.id, { phone, email: f.email, address: f.address }, { phone: previousPhone, email: previousEmail });
          continue;
        }
        await this.refreshContacts(outreachRepo, listing.id, { phone, email: f.email, address: f.address }, { phone: null, email: null });
      }
      if (events.length) await manager.getRepository(FacilityOutreachEvent).insert(events);
    });
  }

  /**
   * Working contacts start as the registry's. Staff corrections are kept: we only replace a value
   * that is empty or still equal to what the registry said last time.
   */
  private async refreshContacts(repo: Repository<FacilityOutreach>, listingId: string, now: { phone: string | null; email: string | null; address: string | null }, previous: { phone: string | null; email: string | null }) {
    let row = await repo.findOne({ where: { listingId } });
    if (!row) row = repo.create({ listingId, status: OutreachStatus.LISTED, invitesSent: 0, reminderStage: 0, phone: null, whatsapp: null, email: null, website: null, address: null, contactName: null, claimTokenHash: null, claimTokenCreatedAt: null, claimedAt: null, lastContactAt: null, nextReminderAt: null });
    let changed = !row.createdAt;
    if (now.phone && (!row.phone || row.phone === previous.phone) && row.phone !== now.phone) { row.phone = now.phone; changed = true; }
    if (now.email && (!row.email || row.email === previous.email) && row.email !== now.email) { row.email = now.email; changed = true; }
    if (now.address && !row.address) { row.address = now.address; changed = true; }
    if (changed) await repo.save(row);
  }

  /** Registry facilities not seen in a complete run are hidden (unless they have joined). */
  private async retireMissing(startedAt: Date, types: PartnerFacilityType[]): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE partner_facility_listings SET active = false, updated_at = now()
       WHERE source = $1 AND active AND provider_id IS NULL AND facility_type = ANY($2::partner_facility_type_enum[])
         AND (registry_seen_at IS NULL OR registry_seen_at < $3)`,
      [NHFR_SOURCE, types, startedAt],
    );
    return Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  }
}

const TYPE_OF: Record<RegistryKind, PartnerFacilityType> = {
  facilities: PartnerFacilityType.HOSPITAL,
  pharmacies: PartnerFacilityType.PHARMACY,
  laboratories: PartnerFacilityType.LABORATORY,
  imaging: PartnerFacilityType.RADIOLOGY,
};

function pickKeys(o: object, keys: string[]): Record<string, unknown> {
  const src = o as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, src[k] ?? null]));
}
