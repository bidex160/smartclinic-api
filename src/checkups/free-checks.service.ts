import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { CommissionRateSource } from '../commissions/enums/commission-rate-source.enum';
import { ProviderEarningStatusHistory } from '../earnings/entities/provider-earning-status-history.entity';
import { ProviderEarning } from '../earnings/entities/provider-earning.entity';
import { ProviderEarningSourceType } from '../earnings/enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from '../earnings/enums/provider-earning-status.enum';
import { normalizePhone } from '../facility-outreach/places';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { PatientRelationshipStatus } from '../patients/enums/patient-relationship.enum';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { Provider } from '../providers/entities/provider.entity';
import { CurrentProviderService, canManage } from '../providers/current-provider.service';
import { ProviderType } from '../providers/enums/provider-type.enum';
import { User } from '../users/entities/user.entity';
import { CheckupVoucher, FreeCheckPartner, VitalReading } from './checkup.entities';
import { CheckupsService, ReadingInput } from './checkups.service';
import { adviceFor } from './readings';

const DAY = 86_400_000;
const VOUCHER_DAYS = 7;
const GIFTS_PER_YEAR = 6;
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
export const PARTNER_TYPES: readonly ProviderType[] = [ProviderType.PHARMACY, ProviderType.CLINIC, ProviderType.HOSPITAL, ProviderType.DIAGNOSTIC_CENTRE];
export const RELATIONSHIPS = ['MOTHER', 'FATHER', 'GRANDPARENT', 'SPOUSE', 'OTHER'] as const;
export type GiftRelationship = (typeof RELATIONSHIPS)[number];
const CURRENCY: Record<string, string> = { NG: 'NGN', GH: 'GHS', RW: 'RWF' };

export function newVoucherCode(): string {
  let s = '';
  for (let i = 0; i < 8; i += 1) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return s;
}

/** "kn7f-4q9p " → "KN7F4Q9P". */
export function cleanCode(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** "NGN:1500,GHS:15,RWF:1500" → fee in minor units for a currency (0 when unset). */
export function feeFor(setting: string | undefined, currency: string): number {
  for (const part of String(setting ?? '').split(',')) {
    const [cur, amount] = part.split(':').map((x) => x.trim());
    if (cur?.toUpperCase() === currency && Number(amount) > 0) return Math.round(Number(amount) * 100);
  }
  return 0;
}

export interface RedeemInput extends ReadingInput {
  shareWithGifter?: boolean;
}

/**
 * Free "Know your numbers" checks: a code for yourself or a parent, done at a partner pharmacy,
 * which enters the numbers and is paid a small fixed fee through the normal provider payouts.
 * One free check per person (by phone number and by account), a weekly cap overall, and each
 * partner can cap how many it does a week.
 */
@Injectable()
export class FreeChecksService {
  private readonly logger = new Logger(FreeChecksService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CheckupVoucher) private readonly vouchers: Repository<CheckupVoucher>,
    @InjectRepository(FreeCheckPartner) private readonly partners: Repository<FreeCheckPartner>,
    @InjectRepository(VitalReading) private readonly readings: Repository<VitalReading>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientRelationship) private readonly relationships: Repository<PatientRelationship>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    private readonly checkups: CheckupsService,
    private readonly current: CurrentProviderService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private get weeklyCap(): number {
    const v = Number(this.config?.get('FREE_CHECKS_PER_WEEK') ?? 300);
    return Number.isFinite(v) && v >= 0 ? v : 300;
  }

  private fee(currency: string): number {
    return feeFor(this.config?.get<string>('FREE_CHECK_PROVIDER_FEE'), currency);
  }

  // ---------- Patients ----------

  /** My free check: whether I can get one, and the code if I already have it. */
  async mine(user: User) {
    const patient = await this.checkups.patientFor(user);
    const voucher = await this.vouchers.findOne({ where: { recipientPatientId: patient.id, giftedByUserId: user.id, status: In(['ISSUED', 'REDEEMED']) }, order: { createdAt: 'DESC' } })
      ?? await this.vouchers.findOne({ where: { recipientPatientId: patient.id, status: In(['ISSUED', 'REDEEMED']) }, order: { createdAt: 'DESC' } });
    const usedElsewhere = !voucher && (await this.usedFreeCheck(patient.id, patient.phone, patient.countryCode ?? 'NG'));
    return {
      voucher: voucher ? this.voucherView(voucher) : null,
      eligible: !voucher && !usedElsewhere,
      weeklySlotsLeft: await this.slotsLeft(),
    };
  }

  async issueMine(user: User) {
    const patient = await this.checkups.patientFor(user);
    const existing = await this.vouchers.findOne({ where: { recipientPatientId: patient.id, status: 'ISSUED' } });
    if (existing && existing.expiresAt.getTime() > Date.now()) return this.voucherView(existing);
    if (await this.usedFreeCheck(patient.id, patient.phone, patient.countryCode ?? 'NG')) throw new ConflictException('You’ve already had your free check. Your next step is in your plan.');
    await this.requireSlot();
    const voucher = await this.create({
      recipientPatientId: patient.id, recipientName: `${patient.givenName} ${patient.familyName}`.trim().slice(0, 120),
      recipientPhone: patient.phone ? normalizePhone(patient.countryCode ?? 'NG', patient.phone) : null,
      relationship: null, giftedByUserId: user.id, countryCode: patient.countryCode ?? 'NG',
    });
    return this.voucherView(voucher);
  }

  /** Check Mum and Dad: a free check for a parent, by phone or for a family member you manage. */
  async gift(user: User, input: { name: string; relationship: GiftRelationship; phone?: string; countryCode?: string; familyPatientId?: string }) {
    const me = await this.checkups.patientFor(user);
    const name = String(input.name ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 2) throw new BadRequestException('Add their name');
    let recipientPatientId: string | null = null;
    let countryCode = (input.countryCode || me.countryCode || 'NG').toUpperCase();
    let phone: string | null = null;
    if (input.familyPatientId) {
      const link = await this.relationships.findOne({ where: { relatedUserId: user.id, patientId: input.familyPatientId, status: PatientRelationshipStatus.ACTIVE } });
      if (!link) throw new ForbiddenException('You can only send a check to family members you manage');
      const p = await this.patients.findOne({ where: { id: input.familyPatientId, status: PatientStatus.ACTIVE } });
      if (!p) throw new NotFoundException('Family member not found');
      recipientPatientId = p.id;
      countryCode = p.countryCode ?? countryCode;
      phone = p.phone ? normalizePhone(countryCode, p.phone) : null;
    }
    if (input.phone) {
      phone = normalizePhone(countryCode, input.phone);
      if (!phone) throw new BadRequestException('That phone number doesn’t look right');
    }
    if (!phone && !recipientPatientId) throw new BadRequestException('Add their phone number, so the pharmacy can find their check');
    if (phone && phone === normalizePhone(countryCode, me.phone ?? '')) throw new BadRequestException('That’s your own number. Use “My free check” for yourself.');
    const sentThisYear = await this.vouchers.createQueryBuilder('v')
      .where('v.giftedByUserId = :u', { u: user.id }).andWhere('v.recipientPatientId IS DISTINCT FROM :me', { me: me.id })
      .andWhere('v.status <> :c', { c: 'CANCELLED' }).andWhere('v.createdAt > :since', { since: new Date(Date.now() - 365 * DAY) }).getCount();
    if (sentThisYear >= GIFTS_PER_YEAR) throw new ConflictException(`You can send up to ${GIFTS_PER_YEAR} free checks a year. You can still book a full check for them.`);
    const open = phone ? await this.vouchers.findOne({ where: { recipientPhone: phone, status: 'ISSUED' } }) : null;
    if (open && open.expiresAt.getTime() > Date.now()) {
      if (open.giftedByUserId === user.id) return { ...this.voucherView(open), share: this.shareText(open, me.givenName) };
      throw new ConflictException('Someone has already sent them a free check. It’s waiting to be used.');
    }
    if (await this.usedFreeCheck(recipientPatientId, phone, countryCode)) throw new ConflictException('They’ve already had their free check. You can book a full check for them instead.');
    await this.requireSlot();
    const voucher = await this.create({ recipientPatientId, recipientName: name.slice(0, 120), recipientPhone: phone, relationship: input.relationship, giftedByUserId: user.id, countryCode });
    return { ...this.voucherView(voucher), share: this.shareText(voucher, me.givenName) };
  }

  /** Checks I've sent: whether they're done, and the numbers when they agreed to share. */
  async myGifts(user: User) {
    const me = await this.checkups.patientFor(user);
    const rows = await this.vouchers.createQueryBuilder('v')
      .where('v.giftedByUserId = :u', { u: user.id }).andWhere('v.recipientPatientId IS DISTINCT FROM :me', { me: me.id })
      .orderBy('v.createdAt', 'DESC').take(20).getMany();
    const managed = new Set((await this.relationships.find({ where: { relatedUserId: user.id, status: PatientRelationshipStatus.ACTIVE }, select: { patientId: true } })).map((r) => r.patientId));
    const out = [];
    for (const v of rows) {
      const view = { ...this.voucherView(v), relationship: v.relationship, share: v.status === 'ISSUED' ? this.shareText(v, me.givenName) : null, result: null as unknown };
      const canSee = v.status === 'REDEEMED' && (v.shareWithGifter || (v.recipientPatientId && managed.has(v.recipientPatientId)));
      if (canSee) {
        const reading = await this.readings.findOne({ where: { voucherId: v.id } });
        if (reading) view.result = { ...this.checkups.readingView(reading), advice: adviceFor(reading.band) };
      }
      out.push(view);
    }
    return { items: out, giftsLeftThisYear: Math.max(0, GIFTS_PER_YEAR - rows.filter((v) => v.status !== 'CANCELLED' && v.createdAt.getTime() > Date.now() - 365 * DAY).length) };
  }

  async cancelGift(user: User, id: string) {
    const v = await this.vouchers.findOne({ where: { id, giftedByUserId: user.id } });
    if (!v) throw new NotFoundException('Not found');
    if (v.status !== 'ISSUED') throw new ConflictException('Only an unused check can be cancelled');
    await this.vouchers.update({ id }, { status: 'CANCELLED' });
    return { cancelled: true };
  }

  /** Partner pharmacies and clinics for the free check, nearest place first. */
  async partnersNear(countryCode: string, stateOrRegion?: string, city?: string) {
    const rows: { id: string; displayName: string; providerType: string; phone: string | null; city: string | null; state: string | null; address: string | null }[] = await this.dataSource.query(
      `SELECT p.id, p.display_name AS "displayName", p.provider_type AS "providerType", p.phone, p.city, p.state_or_region AS state,
        (SELECT TRIM(BOTH ', ' FROM CONCAT_WS(', ', l.address_line_1, l.city)) FROM provider_locations l WHERE l.provider_id = p.id AND l.is_active ORDER BY l.created_at LIMIT 1) AS address
       FROM free_check_partners f JOIN providers p ON p.id = f.provider_id
       WHERE f.active AND p.deleted_at IS NULL AND p.status = 'ACTIVE' AND p.onboarding_status = 'APPROVED' AND p.country_code = $1
       ORDER BY (LOWER(p.city) = LOWER($3)) DESC NULLS LAST, (LOWER(p.state_or_region) = LOWER($2)) DESC NULLS LAST, p.display_name
       LIMIT 30`,
      [countryCode.toUpperCase(), stateOrRegion ?? '', city ?? ''],
    );
    return { items: rows.map((r) => ({ ...r, nearby: Boolean((city && r.city?.toLowerCase() === city.toLowerCase()) || (stateOrRegion && r.state?.toLowerCase() === stateOrRegion.toLowerCase())) })) };
  }

  /** The person checked (no account needed) sees their own numbers with the code and their phone. */
  async publicResult(code: string, phone: string, countryCode = 'NG') {
    const v = await this.vouchers.findOne({ where: { code: cleanCode(code) } });
    const p = normalizePhone(countryCode.toUpperCase(), phone);
    if (!v || !p || !v.recipientPhone || v.recipientPhone !== p) throw new NotFoundException('We couldn’t find a check for that code and phone number');
    if (v.status !== 'REDEEMED') return { status: v.status, name: firstName(v.recipientName), result: null };
    const reading = await this.readings.findOne({ where: { voucherId: v.id } });
    return { status: v.status, name: firstName(v.recipientName), result: reading ? { ...this.checkups.readingView(reading), advice: adviceFor(reading.band) } : null };
  }

  // ---------- Partner pharmacies ----------

  async partnerStatus(user: User) {
    const { provider } = await this.current.resolveOperationalActor(user);
    const row = await this.partners.findOne({ where: { providerId: provider.id } });
    const currency = CURRENCY[provider.countryCode ?? 'NG'] ?? 'NGN';
    const [{ week, total }] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE redeemed_at > now() - interval '7 days')::int AS week, COUNT(*)::int AS total FROM checkup_vouchers WHERE redeemed_by_provider_id = $1 AND status = 'REDEEMED'`,
      [provider.id],
    );
    return {
      eligible: PARTNER_TYPES.includes(provider.providerType),
      partner: Boolean(row?.active),
      weeklyCapacity: row?.weeklyCapacity ?? 0,
      doneThisWeek: week, doneTotal: total,
      feePerCheckMinor: this.fee(currency), currency,
    };
  }

  async setPartner(user: User, input: { active: boolean; weeklyCapacity?: number }) {
    const actor = await this.current.resolveOperationalActor(user);
    if (!canManage(actor)) throw new ForbiddenException('Only the owner or a manager can change this');
    if (!PARTNER_TYPES.includes(actor.provider.providerType)) throw new ForbiddenException('Pharmacies, clinics, hospitals and diagnostic centres can do free checks');
    await this.partners.save({ providerId: actor.provider.id, active: input.active, weeklyCapacity: Math.max(0, Math.min(10_000, Math.round(input.weeklyCapacity ?? 0))) });
    return this.partnerStatus(user);
  }

  /** Look up a code at the counter: who it's for, and whether it can be used. */
  async lookup(user: User, rawCode: string) {
    const { provider } = await this.current.resolveOperationalActor(user);
    const v = await this.vouchers.findOne({ where: { code: cleanCode(rawCode) } });
    if (!v) throw new NotFoundException('No free check with that code');
    return {
      code: v.code, name: firstName(v.recipientName), status: this.liveStatus(v), expiresAt: v.expiresAt, isGift: Boolean(v.relationship),
      phoneEnding: v.recipientPhone ? v.recipientPhone.slice(-4) : null,
      redeemedHere: v.redeemedByProviderId === provider.id,
    };
  }

  /** Enter the numbers for a free check. Pays the partner's fee through normal payouts. */
  async redeem(user: User, rawCode: string, input: RedeemInput) {
    const actor = await this.current.resolveOperationalActor(user);
    const provider = actor.provider;
    const partner = await this.partners.findOne({ where: { providerId: provider.id } });
    if (!partner?.active) throw new ForbiddenException('Turn on free checks for your facility first');
    if (partner.weeklyCapacity > 0) {
      const [{ n }] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM checkup_vouchers WHERE redeemed_by_provider_id = $1 AND redeemed_at > now() - interval '7 days'`, [provider.id]);
      if (n >= partner.weeklyCapacity) throw new ConflictException('You’ve reached your weekly number of free checks. You can raise it on this page.');
    }
    const code = cleanCode(rawCode);
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CheckupVoucher);
      const v = await repo.findOne({ where: { code }, lock: { mode: 'pessimistic_write' } });
      if (!v) throw new NotFoundException('No free check with that code');
      const status = this.liveStatus(v);
      if (status === 'REDEEMED') throw new ConflictException('This free check has already been used');
      if (status !== 'ISSUED') throw new ConflictException('This free check has expired or been cancelled');
      const { reading, evaluated } = await this.checkups.record(manager, { patientId: v.recipientPatientId, voucherId: v.id, source: 'PHARMACY', providerId: provider.id, enteredByUserId: user.id }, input);
      const currency = CURRENCY[v.countryCode] ?? 'NGN';
      const fee = this.fee(currency);
      v.status = 'REDEEMED';
      v.redeemedAt = new Date();
      v.redeemedByProviderId = provider.id;
      v.providerFeeMinor = fee;
      v.shareWithGifter = Boolean(input.shareWithGifter && v.relationship);
      await repo.save(v);
      if (fee > 0) await this.payPartner(manager, provider.id, v, fee, currency);
      return { v, reading, band: evaluated.band };
    });
    await this.notifyDone(result.v, provider.displayName).catch(() => this.logger.warn('Free check notification failed'));
    return { done: true, name: firstName(result.v.recipientName), reading: this.checkups.readingView(result.reading), advice: adviceFor(result.band), feeMinor: result.v.providerFeeMinor };
  }

  // ---------- Staff ----------

  async adminSummary() {
    const [totals] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE created_at > date_trunc('week', now()))::int AS "issuedThisWeek",
        COUNT(*) FILTER (WHERE status = 'REDEEMED' AND redeemed_at > date_trunc('week', now()))::int AS "doneThisWeek",
        COUNT(*) FILTER (WHERE status = 'REDEEMED')::int AS "doneTotal",
        COUNT(*) FILTER (WHERE relationship IS NOT NULL)::int AS gifts,
        COUNT(*) FILTER (WHERE relationship IS NOT NULL AND status = 'REDEEMED')::int AS "giftsDone",
        COALESCE(SUM(provider_fee_minor) FILTER (WHERE status = 'REDEEMED'), 0)::bigint AS "feesMinor"
       FROM checkup_vouchers`,
    );
    const bands = await this.dataSource.query(`SELECT band, COUNT(*)::int AS n FROM checkup_plans GROUP BY band ORDER BY n DESC`);
    const steps = await this.dataSource.query(`SELECT next_step AS step, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE next_due_at < now())::int AS overdue FROM checkup_plans GROUP BY next_step`);
    const partners = await this.dataSource.query(
      `SELECT p.display_name AS "displayName", p.city, p.state_or_region AS state, f.active, f.weekly_capacity AS "weeklyCapacity",
        (SELECT COUNT(*)::int FROM checkup_vouchers v WHERE v.redeemed_by_provider_id = p.id AND v.status = 'REDEEMED') AS done
       FROM free_check_partners f JOIN providers p ON p.id = f.provider_id ORDER BY done DESC, p.display_name LIMIT 100`,
    );
    return { totals: { ...totals, feesMinor: Number(totals.feesMinor) }, weeklyCap: this.weeklyCap, feeSetting: this.config?.get('FREE_CHECK_PROVIDER_FEE') ?? null, bands, steps, partners };
  }

  // ---------- Internals ----------

  private liveStatus(v: CheckupVoucher) {
    return v.status === 'ISSUED' && v.expiresAt.getTime() < Date.now() ? 'EXPIRED' : v.status;
  }

  private voucherView(v: CheckupVoucher) {
    return { id: v.id, code: v.code, status: this.liveStatus(v), name: v.recipientName, expiresAt: v.expiresAt, redeemedAt: v.redeemedAt };
  }

  private shareText(v: CheckupVoucher, fromName: string) {
    const origin = String(this.config?.get('FRONTEND_URL') ?? 'https://smartclinicnetwork.com').replace(/\/+$/, '');
    const text = `Hello ${firstName(v.recipientName)}, ${fromName} has given you a free health check on SmartClinic. `
      + `At a partner pharmacy, show this code: ${v.code.slice(0, 4)}-${v.code.slice(4)}. They’ll check your blood pressure, sugar and weight in about 15 minutes, free. `
      + `Find a pharmacy and see your results: ${origin}/my-check?code=${v.code}`;
    return { text, whatsappUrl: `https://wa.me/${v.recipientPhone ? v.recipientPhone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}` };
  }

  private async create(input: Pick<CheckupVoucher, 'recipientPatientId' | 'recipientName' | 'recipientPhone' | 'relationship' | 'giftedByUserId' | 'countryCode'>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.vouchers.save(this.vouchers.create({ ...input, code: newVoucherCode(), status: 'ISSUED', expiresAt: new Date(Date.now() + VOUCHER_DAYS * DAY), providerFeeMinor: 0, shareWithGifter: false }));
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
    throw new ConflictException('Please try again');
  }

  private async usedFreeCheck(patientId: string | null, phone: string | null | undefined, countryCode: string): Promise<boolean> {
    const p = phone ? normalizePhone(countryCode, phone) : null;
    if (!patientId && !p) return false;
    const qb = this.vouchers.createQueryBuilder('v').where('v.status = :s', { s: 'REDEEMED' });
    if (patientId && p) qb.andWhere('(v.recipientPatientId = :pid OR v.recipientPhone = :p)', { pid: patientId, p });
    else if (patientId) qb.andWhere('v.recipientPatientId = :pid', { pid: patientId });
    else qb.andWhere('v.recipientPhone = :p', { p });
    return (await qb.getCount()) > 0;
  }

  private async slotsLeft(): Promise<number | null> {
    if (this.weeklyCap === 0) return null;
    const [{ n }] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM checkup_vouchers WHERE status <> 'CANCELLED' AND created_at > date_trunc('week', now())`);
    return Math.max(0, this.weeklyCap - n);
  }

  private async requireSlot() {
    const left = await this.slotsLeft();
    if (left !== null && left <= 0) throw new HttpException('This week’s free checks are all taken. New ones open on Monday.', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** The partner's fee, payable through the usual provider payouts (the check is already done). */
  private async payPartner(manager: EntityManager, providerId: string, v: CheckupVoucher, fee: number, currency: string) {
    const repo = manager.getRepository(ProviderEarning);
    const existing = await repo.findOne({ where: { sourceType: ProviderEarningSourceType.FREE_CHECK, sourceReference: v.code } });
    if (existing) return;
    const now = new Date();
    const earning = await repo.save(repo.create({
      providerId, paymentTransactionId: null, sourceType: ProviderEarningSourceType.FREE_CHECK, sourceReference: v.code, currency,
      grossAmountMinor: String(fee), commissionBps: 0, commissionSource: CommissionRateSource.PLATFORM_DEFAULT, commissionAmountMinor: '0',
      referralShareMinor: '0', providerShareMinor: String(fee), status: ProviderEarningStatus.PAYABLE, payableAt: now, settledAt: null,
    }));
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id, fromStatus: null, toStatus: ProviderEarningStatus.PAYABLE, actorUserId: null,
      reasonCode: 'FREE_CHECK_DONE', reasonNote: 'SmartClinic free check fee',
    });
  }

  private async notifyDone(v: CheckupVoucher, providerName: string) {
    if (!this.notifications) return;
    const targets: { userId: string; title: string; body: string; key: string }[] = [];
    if (v.giftedByUserId) {
      const gifter = await this.patients.findOne({ where: { userId: v.giftedByUserId } });
      const self = gifter && v.recipientPatientId === gifter.id;
      if (!self) {
        targets.push({
          userId: v.giftedByUserId,
          title: `${firstName(v.recipientName)} has done their free check`,
          body: v.shareWithGifter ? `Done at ${providerName}. They agreed to share the results with you: open SmartClinic to see them.` : `Done at ${providerName}. Their results are private to them.`,
          key: `free-check-gift:${v.id}`,
        });
      }
    }
    if (v.recipientPatientId) {
      const p = await this.patients.findOne({ where: { id: v.recipientPatientId } });
      if (p?.userId) targets.push({ userId: p.userId, title: 'Your numbers are in', body: `Your free check at ${providerName} is done. Open SmartClinic to see what your numbers mean and your next step.`, key: `free-check-done:${v.id}` });
    }
    for (const t of targets) {
      await this.dataSource.transaction((m) => this.notifications!.createTransactionalNotification(m, {
        userId: t.userId, type: NotificationType.FREE_CHECK_DONE, title: t.title.slice(0, 160), message: t.body,
        entityType: NotificationEntityType.WELLNESS, entityReference: v.code, metadata: { route: '/me/checkup', kind: 'freeCheckDone' },
        idempotencyKey: t.key, email: { enabled: true },
      }));
    }
  }
}

function firstName(name: string): string {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}
