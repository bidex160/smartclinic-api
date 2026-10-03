import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac } from 'crypto';
import { DataSource, EntityManager, IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { createAppConfiguration } from '../config/environment';
import { EMAIL_PROVIDER, EmailProvider, EmailSendOutcome } from '../notifications/email/email-provider';
import { renderTransactionalEmail, sanitizeEmailSubject } from '../notifications/email/transactional-email-renderer';
import { PartnerFacilityListing, PartnerFacilityReadiness, PartnerFacilityType } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { Provider } from '../providers/entities/provider.entity';
import { ProviderType } from '../providers/enums/provider-type.enum';
import { User } from '../users/entities/user.entity';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../whatsapp/adapters/whatsapp-provider.interface';
import { csvObjects } from './csv';
import { FacilityOutreach, FacilityOutreachEvent, OutreachEventKind, OutreachStatus } from './outreach.entities';
import { normalizePhone, normalizeState } from './places';

export type OutreachStage = 'LISTED' | 'CONTACTED' | 'CLAIMED' | 'VERIFIED' | 'LIVE' | 'DECLINED' | 'WRONG_CONTACT';
export const STAGES: readonly OutreachStage[] = ['LISTED', 'CONTACTED', 'CLAIMED', 'VERIFIED', 'LIVE', 'DECLINED', 'WRONG_CONTACT'];
const REMINDER_DAYS = [2, 5] as const; // first reminder 2 days after the invite, the last one 5 days after that
const MAX_IMPORT_ROWS = 5000;
const SCHEDULER_MS = 60 * 60_000;
const DAY = 86_400_000;

export interface ContactInput {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  contactName?: string | null;
}

export interface DashboardQuery {
  countryCode?: string;
  stateOrRegion?: string;
  city?: string;
  facilityType?: PartnerFacilityType;
  stage?: OutreachStage;
  search?: string;
  page?: number;
  limit?: number;
}

/** Which sign-up type a claimed listing becomes. */
export function providerTypeFor(type: PartnerFacilityType): ProviderType {
  if (type === PartnerFacilityType.PHARMACY) return ProviderType.PHARMACY;
  if (type === PartnerFacilityType.LABORATORY || type === PartnerFacilityType.RADIOLOGY) return ProviderType.DIAGNOSTIC_CENTRE;
  return ProviderType.HOSPITAL;
}

export function facilityTypeFrom(raw: string): PartnerFacilityType | null {
  const v = raw.trim().toLowerCase();
  if (!v || /hospital|clinic|medical cent|health cent|maternity|teaching/.test(v)) return PartnerFacilityType.HOSPITAL;
  if (/pharm|chemist|drug/.test(v)) return PartnerFacilityType.PHARMACY;
  if (/radiol|imaging|scan|x-?ray/.test(v)) return PartnerFacilityType.RADIOLOGY;
  if (/lab|diagnos/.test(v)) return PartnerFacilityType.LABORATORY;
  return null;
}

/** What staff should do next with this facility. */
export function nextAction(stage: OutreachStage, row: { phone: string | null; whatsapp: string | null; email: string | null; invitesSent: number; lastContactAt: Date | null; reminderStage: number }, now = new Date()): string {
  const reachable = Boolean(row.phone || row.whatsapp || row.email);
  switch (stage) {
    case 'LIVE': return 'Live: patients can book them';
    case 'VERIFIED': return 'Licence checked: approve the account';
    case 'CLAIMED': return 'Claimed: check their licence';
    case 'DECLINED': return 'Declined: try again in 3 months';
    case 'WRONG_CONTACT': return 'Find a working phone number or email';
    case 'CONTACTED': {
      const days = row.lastContactAt ? Math.floor((now.getTime() - new Date(row.lastContactAt).getTime()) / DAY) : 0;
      if (row.reminderStage >= 2 || days >= 7) return 'Call them: invite not claimed after a week';
      return `Invited ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}: reminders are scheduled`;
    }
    default:
      return reachable ? 'Send the invite' : 'Add a phone number, WhatsApp or email';
  }
}

/**
 * Bringing listed hospitals, pharmacies and labs onto SmartClinic: contacts, a claim link per
 * listing, invites by email and WhatsApp with two reminders, a call log, and a dashboard ranked by
 * how many patients have asked for each place.
 */
@Injectable()
export class FacilityOutreachService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacilityOutreachService.name);
  private readonly app = createAppConfiguration();
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PartnerFacilityListing) private readonly listings: Repository<PartnerFacilityListing>,
    @InjectRepository(FacilityOutreach) private readonly outreach: Repository<FacilityOutreach>,
    @InjectRepository(FacilityOutreachEvent) private readonly events: Repository<FacilityOutreachEvent>,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
    @Optional() @Inject(WHATSAPP_PROVIDER) private readonly whatsapp?: WhatsAppProvider,
    @Optional() private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test' || this.config?.get('FACILITY_REMINDERS_ENABLED') === 'false') return;
    this.interval = setInterval(() => {
      this.sendReminders().catch((e) => this.logger.warn(`Facility reminders failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, SCHEDULER_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  // ---------- Dashboard ----------

  async dashboard(q: DashboardQuery, now = new Date()) {
    const { where, params } = this.filters(q);
    const stageSql = `CASE
      WHEN p.id IS NOT NULL AND p.onboarding_status = 'APPROVED' AND p.status = 'ACTIVE' THEN 'LIVE'
      WHEN p.id IS NOT NULL AND c.status = 'VERIFIED' THEN 'VERIFIED'
      WHEN p.id IS NOT NULL THEN 'CLAIMED'
      WHEN o.status IN ('DECLINED', 'WRONG_CONTACT') THEN o.status
      WHEN o.status IN ('INVITED', 'CONTACTED') THEN 'CONTACTED'
      ELSE 'LISTED' END`;
    const base = `FROM partner_facility_listings l
      LEFT JOIN facility_outreach o ON o.listing_id = l.id
      LEFT JOIN providers p ON p.id = l.provider_id AND p.deleted_at IS NULL
      LEFT JOIN provider_credentials c ON c.provider_id = p.id
      LEFT JOIN (SELECT listing_id, COUNT(DISTINCT patient_id)::int AS n FROM partner_facility_interests GROUP BY listing_id) d ON d.listing_id = l.id
      WHERE l.active = true ${where}`;
    const totals = await this.dataSource.query(`SELECT ${stageSql} AS stage, COUNT(*)::int AS n ${base} GROUP BY 1`, params);
    const byPlace = await this.dataSource.query(
      `SELECT l.country_code AS "countryCode", l.state_or_region AS state, l.city, ${stageSql} AS stage, COUNT(*)::int AS n, COALESCE(SUM(d.n), 0)::int AS demand
       ${base} GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3`,
      params,
    );
    const stageFilter = q.stage ? ` AND (${stageSql}) = $${params.length + 1}` : '';
    const listParams = q.stage ? [...params, q.stage] : params;
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const offset = (Math.max(q.page ?? 1, 1) - 1) * limit;
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT l.id, l.display_name AS "displayName", l.facility_type AS "facilityType", l.country_code AS "countryCode", l.state_or_region AS state, l.city,
        l.source, ${stageSql} AS stage, COALESCE(d.n, 0) AS demand,
        o.phone, o.whatsapp, o.email, o.website, o.address, o.contact_name AS "contactName", o.invites_sent AS "invitesSent",
        o.last_contact_at AS "lastContactAt", o.reminder_stage AS "reminderStage", o.claim_token_hash IS NOT NULL AS "hasClaimLink",
        p.provider_reference AS "providerReference", p.id AS "providerId"
       ${base}${stageFilter}
       ORDER BY COALESCE(d.n, 0) DESC, l.display_name ASC
       LIMIT ${limit} OFFSET ${offset}`,
      listParams,
    );
    const [{ total }] = await this.dataSource.query(`SELECT COUNT(*)::int AS total ${base}${stageFilter}`, listParams);
    const summary = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<OutreachStage, number>;
    for (const t of totals as { stage: OutreachStage; n: number }[]) summary[t.stage] = t.n;
    const places = new Map<string, { countryCode: string; state: string | null; city: string | null; demand: number; stages: Record<string, number>; total: number }>();
    for (const r of byPlace as { countryCode: string; state: string | null; city: string | null; stage: string; n: number; demand: number }[]) {
      const key = `${r.countryCode}|${r.state}|${r.city}`;
      let p = places.get(key);
      if (!p) places.set(key, (p = { countryCode: r.countryCode, state: r.state, city: r.city, demand: 0, stages: {}, total: 0 }));
      p.stages[r.stage] = r.n;
      p.total += r.n;
      p.demand += r.demand;
    }
    return {
      summary,
      total,
      places: [...places.values()].sort((a, b) => b.demand - a.demand || b.total - a.total).slice(0, 100),
      items: rows.map((r) => ({
        ...r,
        demand: Number(r.demand),
        invitesSent: Number(r.invitesSent ?? 0),
        nextAction: nextAction(r.stage as OutreachStage, {
          phone: (r.phone as string) ?? null, whatsapp: (r.whatsapp as string) ?? null, email: (r.email as string) ?? null,
          invitesSent: Number(r.invitesSent ?? 0), lastContactAt: (r.lastContactAt as Date) ?? null, reminderStage: Number(r.reminderStage ?? 0),
        }, now),
      })),
    };
  }

  async history(listingId: string) {
    await this.requireListing(listingId);
    const rows = await this.events.find({ where: { listingId }, order: { createdAt: 'DESC' }, take: 50, relations: { byUser: true } });
    return rows.map((e) => ({ kind: e.kind, note: e.note, at: e.createdAt, by: e.byUser?.displayName ?? (e.byUserId ? 'Staff' : 'SmartClinic') }));
  }

  // ---------- Contacts and import ----------

  async updateContacts(listingId: string, input: ContactInput, admin: User) {
    const listing = await this.requireListing(listingId);
    const row = await this.row(listing.id);
    this.applyContacts(row, listing.countryCode, input);
    if (row.status === OutreachStatus.WRONG_CONTACT && (input.phone || input.whatsapp || input.email)) row.status = row.invitesSent ? OutreachStatus.INVITED : OutreachStatus.LISTED;
    await this.outreach.save(row);
    await this.log(listing.id, OutreachEventKind.NOTE, 'Contact details updated', admin.id);
    return this.contactView(row);
  }

  /** Spreadsheet upload: one facility per row. Matching rows (same name, state and city) are updated, not duplicated. */
  async importCsv(csv: string, admin: User, defaults: { countryCode?: string; facilityType?: PartnerFacilityType } = {}) {
    const rows = csvObjects(csv);
    if (!rows.length) throw new BadRequestException('The file is empty. The first row must be the column names.');
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Up to ${MAX_IMPORT_ROWS} rows at a time`);
    const pick = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v && v.trim()) ?? '';
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
    for (const [i, r] of rows.entries()) {
      const rowNumber = i + 2;
      const name = pick(r, 'name', 'facility_name', 'facility', 'display_name').replace(/\s+/g, ' ').trim();
      const countryCode = (pick(r, 'country', 'country_code') || defaults.countryCode || '').toUpperCase().slice(0, 2);
      if (!name) { result.skipped += 1; result.errors.push({ row: rowNumber, message: 'Missing name' }); continue; }
      if (!['NG', 'GH', 'RW'].includes(countryCode)) { result.skipped += 1; result.errors.push({ row: rowNumber, message: 'Country must be NG, GH or RW' }); continue; }
      const facilityType = facilityTypeFrom(pick(r, 'type', 'facility_type', 'category')) ?? defaults.facilityType ?? null;
      if (!facilityType) { result.skipped += 1; result.errors.push({ row: rowNumber, message: 'Type must be hospital, clinic, pharmacy, laboratory or radiology' }); continue; }
      const state = normalizeState(countryCode, pick(r, 'state', 'state_or_region', 'region', 'province'));
      const city = pick(r, 'city', 'town', 'lga', 'district').replace(/\s+/g, ' ').trim() || null;
      try {
        const created = await this.dataSource.transaction(async (manager) => {
          const listingRepo = manager.getRepository(PartnerFacilityListing);
          let listing = await listingRepo
            .createQueryBuilder('l')
            .where('LOWER(l.displayName) = LOWER(:name)', { name })
            .andWhere('l.countryCode = :countryCode', { countryCode })
            .andWhere('COALESCE(LOWER(l.stateOrRegion), \'\') = COALESCE(LOWER(:state), \'\')', { state })
            .andWhere('COALESCE(LOWER(l.city), \'\') = COALESCE(LOWER(:city), \'\')', { city })
            .getOne();
          const isNew = !listing;
          if (!listing) {
            const ref = pick(r, 'reference', 'source_reference', 'id') || createHash('sha1').update(`${name}|${countryCode}|${state}|${city}`.toLowerCase()).digest('hex').slice(0, 24);
            listing = await listingRepo.save(listingRepo.create({
              source: 'IMPORT', sourceReference: ref.slice(0, 100), displayName: name.slice(0, 240), facilityType, countryCode,
              stateOrRegion: state, city, readiness: PartnerFacilityReadiness.AVAILABLE_TO_JOIN, providerId: null, sourceVerifiedAt: new Date(), active: true,
            }));
          }
          const repo = manager.getRepository(FacilityOutreach);
          const row = (await repo.findOne({ where: { listingId: listing.id } })) ?? repo.create({ listingId: listing.id, status: OutreachStatus.LISTED, invitesSent: 0, reminderStage: 0 });
          this.applyContacts(row, countryCode, {
            phone: pick(r, 'phone', 'telephone', 'phone_number', 'mobile') || undefined,
            whatsapp: pick(r, 'whatsapp', 'whatsapp_number') || undefined,
            email: pick(r, 'email', 'email_address') || undefined,
            website: pick(r, 'website', 'url') || undefined,
            address: pick(r, 'address', 'street') || undefined,
            contactName: pick(r, 'contact_name', 'contact', 'contact_person') || undefined,
          }, true);
          await repo.save(row);
          if (isNew) await manager.getRepository(FacilityOutreachEvent).insert({ listingId: listing.id, kind: OutreachEventKind.IMPORTED, note: 'Added from a spreadsheet', byUserId: admin.id });
          return isNew;
        });
        if (created) result.created += 1;
        else result.updated += 1;
      } catch (e) {
        result.skipped += 1;
        result.errors.push({ row: rowNumber, message: e instanceof BadRequestException ? String(e.message) : 'Could not save this row' });
      }
    }
    result.errors = result.errors.slice(0, 200);
    return result;
  }

  // ---------- Claim links and invites ----------

  /** The listing's claim link. Same link every time until it is reset (which stops the old one working). */
  async claimLink(listingId: string, opts: { reset?: boolean } = {}) {
    const listing = await this.requireListing(listingId);
    if (listing.providerId) throw new ConflictException('This facility has already been claimed');
    const row = await this.row(listing.id);
    if (!row.claimTokenHash || opts.reset) {
      row.claimTokenCreatedAt = new Date();
      row.claimTokenHash = sha256(this.token(listing.id, row.claimTokenCreatedAt));
      await this.outreach.save(row);
    }
    const token = this.token(listing.id, row.claimTokenCreatedAt!);
    return { url: this.claimUrl(token), createdAt: row.claimTokenCreatedAt };
  }

  /**
   * Send the invite. Email and (when Meta has approved the template) WhatsApp go automatically.
   * Otherwise we hand back ready-to-send WhatsApp and SMS links for staff to send from their phone.
   */
  async invite(listingId: string, admin: User, channels: readonly ('EMAIL' | 'WHATSAPP')[] = ['EMAIL', 'WHATSAPP']) {
    const listing = await this.requireListing(listingId);
    const row = await this.row(listing.id);
    const { url } = await this.claimLink(listing.id);
    const demand = await this.demand(listing.id);
    const text = inviteText(listing.displayName, listing.city, demand, url);
    const sent: string[] = [];
    if (channels.includes('EMAIL') && row.email) {
      if (await this.sendEmail(row.email, listing, url, demand, `facility-invite:${listing.id}:${row.invitesSent + 1}`, false)) {
        sent.push('EMAIL');
        await this.log(listing.id, OutreachEventKind.INVITE_EMAIL, row.email, admin.id);
      }
    }
    const waNumber = row.whatsapp ?? row.phone;
    if (channels.includes('WHATSAPP') && waNumber && this.whatsappTemplateReady()) {
      if (await this.sendWhatsApp(waNumber, listing.displayName, url)) {
        sent.push('WHATSAPP');
        await this.log(listing.id, OutreachEventKind.INVITE_WHATSAPP, waNumber, admin.id);
      }
    }
    if (sent.length) await this.markInvited(row);
    return {
      sent,
      claimUrl: url,
      message: text,
      // Send from your own phone when WhatsApp isn't automatic yet, then tap "I sent it".
      whatsappUrl: waNumber ? `https://wa.me/${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : null,
      smsUrl: row.phone ? `sms:${row.phone}?body=${encodeURIComponent(text)}` : null,
      automaticWhatsApp: this.whatsappTemplateReady(),
    };
  }

  async markSentManually(listingId: string, admin: User, channel: 'WHATSAPP' | 'SMS') {
    const listing = await this.requireListing(listingId);
    const row = await this.row(listing.id);
    await this.markInvited(row);
    await this.log(listing.id, OutreachEventKind.INVITE_MANUAL, `${channel === 'SMS' ? 'SMS' : 'WhatsApp'} sent from a staff phone`, admin.id);
    return this.contactView(row);
  }

  /** A call or visit, and how it went. */
  async logContact(listingId: string, admin: User, input: { kind: 'CALL' | 'VISIT' | 'NOTE'; outcome?: 'INTERESTED' | 'CALL_BACK' | 'NO_ANSWER' | 'DECLINED' | 'WRONG_CONTACT'; note?: string }) {
    const listing = await this.requireListing(listingId);
    const row = await this.row(listing.id);
    if (input.kind !== 'NOTE') row.lastContactAt = new Date();
    if (!listing.providerId) {
      if (input.outcome === 'DECLINED') row.status = OutreachStatus.DECLINED;
      else if (input.outcome === 'WRONG_CONTACT') row.status = OutreachStatus.WRONG_CONTACT;
      else if (input.kind !== 'NOTE' && input.outcome !== 'NO_ANSWER') row.status = row.status === OutreachStatus.INVITED ? OutreachStatus.INVITED : OutreachStatus.CONTACTED;
    }
    await this.outreach.save(row);
    const label = { INTERESTED: 'Interested', CALL_BACK: 'Call back later', NO_ANSWER: 'No answer', DECLINED: 'Not interested', WRONG_CONTACT: 'Wrong number or email' }[input.outcome ?? 'INTERESTED'];
    const note = [input.outcome ? label : null, input.note?.trim()].filter(Boolean).join(' · ').slice(0, 500) || null;
    await this.log(listing.id, input.kind === 'CALL' ? OutreachEventKind.CALL : input.kind === 'VISIT' ? OutreachEventKind.VISIT : OutreachEventKind.NOTE, note, admin.id);
    return this.contactView(row);
  }

  // ---------- Public claim ----------

  async preview(token: string) {
    const row = await this.byToken(token);
    const listing = await this.requireListing(row.listingId);
    return {
      displayName: listing.displayName,
      facilityType: listing.facilityType,
      providerType: providerTypeFor(listing.facilityType),
      countryCode: listing.countryCode,
      stateOrRegion: listing.stateOrRegion,
      city: listing.city,
      interestedPatients: await this.demand(listing.id),
      claimed: Boolean(listing.providerId),
    };
  }

  /** Called inside provider sign-up: link the new account to the listing. */
  async claim(manager: EntityManager, token: string, provider: Provider): Promise<void> {
    const repo = manager.getRepository(FacilityOutreach);
    const row = await repo.findOne({ where: { claimTokenHash: sha256(token) }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new BadRequestException('This claim link is no longer valid. Ask SmartClinic for a new one.');
    const listings = manager.getRepository(PartnerFacilityListing);
    const listing = await listings.findOne({ where: { id: row.listingId }, lock: { mode: 'pessimistic_write' } });
    if (!listing) throw new BadRequestException('This claim link is no longer valid.');
    if (listing.providerId) throw new ConflictException('This facility has already been claimed. Contact SmartClinic if this is wrong.');
    listing.providerId = provider.id;
    listing.readiness = PartnerFacilityReadiness.JOINED;
    await listings.save(listing);
    row.status = OutreachStatus.CLAIMED;
    row.claimedAt = new Date();
    row.nextReminderAt = null;
    await repo.save(row);
    await manager.getRepository(FacilityOutreachEvent).insert({ listingId: listing.id, kind: OutreachEventKind.CLAIMED, note: `Claimed by ${provider.displayName}`.slice(0, 500), byUserId: null });
  }

  // ---------- Reminders ----------

  /** Two reminders after an invite: day 2 and day 7. After that it goes on the call list. */
  async sendReminders(now = new Date()): Promise<number> {
    const due = await this.outreach.find({ where: { status: OutreachStatus.INVITED, claimedAt: IsNull(), nextReminderAt: LessThanOrEqual(now) }, take: 200 });
    let sent = 0;
    for (const row of due) {
      const listing = await this.listings.findOne({ where: { id: row.listingId } });
      if (!listing || listing.providerId) { row.nextReminderAt = null; await this.outreach.save(row); continue; }
      const { url } = await this.claimLink(listing.id).catch(() => ({ url: '' }));
      if (!url) continue;
      const demand = await this.demand(listing.id);
      if (row.email && (await this.sendEmail(row.email, listing, url, demand, `facility-reminder:${listing.id}:${row.reminderStage + 1}`, true))) {
        await this.log(listing.id, OutreachEventKind.REMINDER_EMAIL, row.email, null);
        sent += 1;
      }
      const wa = row.whatsapp ?? row.phone;
      if (wa && this.whatsappTemplateReady() && (await this.sendWhatsApp(wa, listing.displayName, url))) {
        await this.log(listing.id, OutreachEventKind.REMINDER_WHATSAPP, wa, null);
        sent += 1;
      }
      row.reminderStage += 1;
      row.nextReminderAt = row.reminderStage < REMINDER_DAYS.length ? new Date(now.getTime() + REMINDER_DAYS[row.reminderStage] * DAY) : null;
      await this.outreach.save(row);
    }
    return sent;
  }

  // ---------- Internals ----------

  private filters(q: DashboardQuery) {
    const parts: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => { params.push(v); parts.push(sql.replace('?', `$${params.length}`)); };
    if (q.countryCode) add('l.country_code = ?', q.countryCode.toUpperCase());
    if (q.stateOrRegion) add('LOWER(l.state_or_region) = LOWER(?)', normalizeState(q.countryCode, q.stateOrRegion));
    if (q.city) add('LOWER(l.city) = LOWER(?)', q.city.trim());
    if (q.facilityType) add('l.facility_type = ?', q.facilityType);
    if (q.search) add('l.display_name ILIKE ?', `%${q.search.trim().replace(/[%_]/g, '')}%`);
    return { where: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
  }

  private applyContacts(row: FacilityOutreach, countryCode: string, input: ContactInput, onlyFill = false) {
    const set = <K extends keyof ContactInput>(key: K, value: string | null) => {
      if (input[key] === undefined) return;
      if (onlyFill && !value) return;
      (row as unknown as Record<string, string | null>)[key] = value;
    };
    if (input.phone !== undefined) {
      const p = normalizePhone(countryCode, input.phone);
      if (input.phone && !p) throw new BadRequestException('That phone number doesn’t look right');
      set('phone', p);
    }
    if (input.whatsapp !== undefined) {
      const w = normalizePhone(countryCode, input.whatsapp);
      if (input.whatsapp && !w) throw new BadRequestException('That WhatsApp number doesn’t look right');
      set('whatsapp', w);
    }
    if (input.email !== undefined) {
      const e = String(input.email ?? '').trim().toLowerCase();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new BadRequestException('That email doesn’t look right');
      set('email', e ? e.slice(0, 254) : null);
    }
    if (input.website !== undefined) {
      const w = String(input.website ?? '').trim();
      set('website', w ? (/^https?:\/\//i.test(w) ? w : `https://${w}`).slice(0, 300) : null);
    }
    if (input.address !== undefined) set('address', String(input.address ?? '').trim().slice(0, 300) || null);
    if (input.contactName !== undefined) set('contactName', String(input.contactName ?? '').trim().slice(0, 160) || null);
  }

  private async markInvited(row: FacilityOutreach) {
    row.invitesSent += 1;
    row.lastContactAt = new Date();
    if (row.status !== OutreachStatus.CLAIMED) row.status = OutreachStatus.INVITED;
    row.reminderStage = 0;
    row.nextReminderAt = new Date(Date.now() + REMINDER_DAYS[0] * DAY);
    await this.outreach.save(row);
  }

  private async row(listingId: string): Promise<FacilityOutreach> {
    return (await this.outreach.findOne({ where: { listingId } })) ?? this.outreach.create({ listingId, status: OutreachStatus.LISTED, invitesSent: 0, reminderStage: 0, phone: null, whatsapp: null, email: null, website: null, address: null, contactName: null, claimTokenHash: null, claimTokenCreatedAt: null, claimedAt: null, lastContactAt: null, nextReminderAt: null });
  }

  private contactView(row: FacilityOutreach) {
    return { phone: row.phone, whatsapp: row.whatsapp, email: row.email, website: row.website, address: row.address, contactName: row.contactName, status: row.status, invitesSent: row.invitesSent };
  }

  private async byToken(token: string): Promise<FacilityOutreach> {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(token ?? ''))) throw new NotFoundException('This claim link is not valid');
    const row = await this.outreach.findOne({ where: { claimTokenHash: sha256(token) } });
    if (!row) throw new NotFoundException('This claim link is not valid or has been replaced');
    return row;
  }

  private async requireListing(id: string): Promise<PartnerFacilityListing> {
    const listing = await this.listings.findOne({ where: { id } });
    if (!listing) throw new NotFoundException('Facility not found');
    return listing;
  }

  private async demand(listingId: string): Promise<number> {
    const [r] = await this.dataSource.query('SELECT COUNT(DISTINCT patient_id)::int AS n FROM partner_facility_interests WHERE listing_id = $1', [listingId]);
    return Number(r?.n ?? 0);
  }

  private async log(listingId: string, kind: OutreachEventKind, note: string | null, byUserId: string | null) {
    await this.events.insert({ listingId, kind, note: note?.slice(0, 500) ?? null, byUserId });
  }

  /** Derived from the server secret, so the link can be shown again without storing it. */
  private token(listingId: string, createdAt: Date): string {
    return createHmac('sha256', `${this.app.auth.jwtSecret}:facility-claim`).update(`${listingId}:${createdAt.getTime()}`).digest('base64url').slice(0, 32);
  }

  private claimUrl(token: string): string {
    return `${this.app.frontendUrl.replace(/\/+$/, '')}/claim/${token}`;
  }

  private whatsappTemplateReady(): boolean {
    return this.config?.get('WHATSAPP_ENABLED') === 'true' && Boolean(this.config?.get('FACILITY_INVITE_WHATSAPP_TEMPLATE')) && Boolean(this.whatsapp?.sendTemplate);
  }

  private async sendWhatsApp(to: string, name: string, url: string): Promise<boolean> {
    try {
      await this.whatsapp!.sendTemplate!({ to, template: String(this.config!.get('FACILITY_INVITE_WHATSAPP_TEMPLATE')), language: 'en', bodyParams: [name, url] });
      return true;
    } catch {
      this.logger.warn('Facility WhatsApp invite failed');
      return false;
    }
  }

  private async sendEmail(to: string, listing: PartnerFacilityListing, url: string, demand: number, key: string, reminder: boolean): Promise<boolean> {
    if (!this.email) return false;
    const where = listing.city ? ` in ${listing.city}` : '';
    const rendered = renderTransactionalEmail({
      preheader: demand ? `${demand} patients have asked for ${listing.displayName} on SmartClinic.` : `Claim ${listing.displayName}'s free SmartClinic listing.`,
      title: reminder ? `A reminder: claim ${listing.displayName} on SmartClinic` : `Patients are looking for ${listing.displayName}`,
      body: [
        demand
          ? `${demand} patient${demand === 1 ? ' has' : 's have'} asked to book or register with ${listing.displayName}${where} through SmartClinic.`
          : `${listing.displayName}${where} is listed on SmartClinic, where patients find and book care.`,
        'Claim your free listing to receive their requests, take bookings and get paid. It takes about five minutes; we check your licence before you go live.',
      ],
      action: { label: 'Claim your listing', url },
      footerNote: 'You received this because your facility is in a public health facility register. Reply to this email if you would rather not hear from us.',
    }, { logoUrl: this.app.email.logoUrl });
    try {
      const r = await this.email.sendTransactionalEmail({
        to, fromAddress: this.app.email.fromAddress, fromName: this.app.email.fromName,
        subject: sanitizeEmailSubject(reminder ? `Reminder: claim ${listing.displayName} on SmartClinic` : `Patients are asking for ${listing.displayName} on SmartClinic`),
        html: rendered.html, text: rendered.text, idempotencyKey: key,
      });
      return r.outcome === EmailSendOutcome.SENT;
    } catch {
      this.logger.warn('Facility email invite failed');
      return false;
    }
  }
}

export function inviteText(name: string, city: string | null, demand: number, url: string): string {
  const lead = demand
    ? `Hello ${name}, ${demand} patient${demand === 1 ? ' has' : 's have'} asked for you on SmartClinic${city ? ` in ${city}` : ''}.`
    : `Hello ${name}, patients${city ? ` in ${city}` : ''} are finding care on SmartClinic.`;
  return `${lead} Claim your free listing to receive their requests and get paid: ${url}`;
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}
