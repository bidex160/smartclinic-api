import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';

import { createAppConfiguration } from '../config/environment';
import { EMAIL_PROVIDER, EmailProvider, EmailSendOutcome } from '../notifications/email/email-provider';
import { renderTransactionalEmail, sanitizeEmailSubject } from '../notifications/email/transactional-email-renderer';
import { SMS_PROVIDER, SmsProvider } from '../notifications/sms/sms-provider';
import { PartnerFacilityListing } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../whatsapp/adapters/whatsapp-provider.interface';
import { FacilityOutreachService } from './facility-outreach.service';
import { FacilityOutreach, FacilityOutreachEvent, OutreachEventKind, OutreachStatus } from './outreach.entities';
import { normalizePhone } from './places';
import { NHFR_SOURCE } from './registry/registry-sync.service';

export type CodeChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';
const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_CODES_PER_DAY = 5;
const MAX_ATTEMPTS = 5;
const DAY = 86_400_000;

/** "+2348031234567" → "+234 803 ••• ••67". */
export function maskPhone(p: string): string {
  const d = p.replace(/[^\d+]/g, '');
  if (d.length < 8) return '•••';
  const cc = d.startsWith('+234') ? '+234 ' : d.startsWith('+') ? `${d.slice(0, 4)} ` : '';
  const rest = cc ? d.slice(cc.trim().length) : d;
  return `${cc}${rest.slice(0, 3)} ••• ••${rest.slice(-2)}`;
}

/** "info@stjude.ng" → "i•••@stjude.ng". */
export function maskEmail(e: string): string {
  const [user, domain] = e.split('@');
  if (!user || !domain) return '•••';
  return `${user[0]}${'•'.repeat(Math.min(Math.max(user.length - 1, 3), 6))}@${domain}`;
}

/**
 * Claim by code: a hospital finds itself, we send a 6-digit code to the phone or email the
 * registry holds for it, and entering the code proves they control that official contact. With a
 * licence in good standing in the registry, that is enough to go live without a staff check.
 */
@Injectable()
export class FacilityClaimCodeService {
  private readonly logger = new Logger(FacilityClaimCodeService.name);
  private readonly app = createAppConfiguration();

  constructor(
    @InjectRepository(PartnerFacilityListing) private readonly listings: Repository<PartnerFacilityListing>,
    @InjectRepository(FacilityOutreach) private readonly outreach: Repository<FacilityOutreach>,
    @InjectRepository(FacilityOutreachEvent) private readonly events: Repository<FacilityOutreachEvent>,
    private readonly outreachService: FacilityOutreachService,
    @Optional() @Inject(SMS_PROVIDER) private readonly sms?: SmsProvider | null,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
    @Optional() @Inject(WHATSAPP_PROVIDER) private readonly whatsapp?: WhatsAppProvider,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Find your facility. Contacts are masked; nothing here reveals a full phone or email. */
  async search(input: { q: string; countryCode?: string; stateOrRegion?: string }) {
    const q = String(input.q ?? '').replace(/[%_]/g, '').replace(/\s+/g, ' ').trim();
    if (q.length < 3) return { items: [] };
    const qb = this.listings.createQueryBuilder('l')
      .leftJoin(FacilityOutreach, 'o', 'o.listing_id = l.id')
      .addSelect(['o.phone', 'o.email', 'o.whatsapp'])
      .where('l.active = true')
      .andWhere('l.displayName ILIKE :q', { q: `%${q}%` });
    if (input.countryCode) qb.andWhere('l.countryCode = :cc', { cc: input.countryCode.toUpperCase() });
    if (input.stateOrRegion) qb.andWhere('l.stateOrRegion ILIKE :st', { st: input.stateOrRegion.trim() });
    const rows = await qb
      .orderBy('CASE WHEN LOWER(l.displayName) = LOWER(:exact) THEN 0 WHEN l.displayName ILIKE :starts THEN 1 ELSE 2 END', 'ASC')
      .setParameter('exact', q).setParameter('starts', `${q}%`)
      .addOrderBy('l.displayName', 'ASC')
      .limit(20)
      .getRawAndEntities();
    return {
      items: rows.entities.map((l, i) => {
        const raw = rows.raw[i] as Record<string, string | null>;
        return {
          id: l.id,
          displayName: l.displayName,
          facilityType: l.facilityType,
          city: l.city,
          stateOrRegion: l.stateOrRegion,
          address: l.address,
          claimed: Boolean(l.providerId),
          registryListed: l.source === NHFR_SOURCE,
          registryVerified: l.registryVerified,
          channels: l.providerId ? [] : this.channels(l, { phone: raw['o_phone'] ?? null, email: raw['o_email'] ?? null, whatsapp: raw['o_whatsapp'] ?? null }).map(({ channel, masked }) => ({ channel, masked })),
        };
      }),
    };
  }

  /** How a code can reach one facility (masked), for the claim page. */
  async channelsFor(listingId: string) {
    const listing = await this.listing(listingId);
    const row = await this.row(listing.id);
    return {
      id: listing.id, displayName: listing.displayName, claimed: Boolean(listing.providerId), registryVerified: listing.registryVerified,
      channels: listing.providerId ? [] : this.channels(listing, row).map(({ channel, masked }) => ({ channel, masked })),
    };
  }

  async sendCode(listingId: string, channel: CodeChannel, now = new Date()) {
    const listing = await this.listing(listingId);
    if (listing.providerId) throw new ConflictException('This facility has already been claimed. If that wasn’t you, contact SmartClinic.');
    const row = await this.row(listing.id);
    const target = this.channels(listing, row).find((c) => c.channel === channel);
    if (!target) throw new BadRequestException('We can’t send a code that way for this facility. Choose another option.');
    if (row.claimCodeSentAt && now.getTime() - row.claimCodeSentAt.getTime() < RESEND_AFTER_MS) {
      throw new HttpException('Please wait a minute before asking for another code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!row.claimCodeWindowAt || now.getTime() - row.claimCodeWindowAt.getTime() > DAY) { row.claimCodeWindowAt = now; row.claimCodesSent = 0; }
    if (row.claimCodesSent >= MAX_CODES_PER_DAY) throw new HttpException('Too many codes today. Try again tomorrow, or contact SmartClinic.', HttpStatus.TOO_MANY_REQUESTS);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const delivered = await this.deliver(channel, target.to, listing.displayName, code);
    if (!delivered) throw new HttpException('We couldn’t send the code just now. Try another option or try again shortly.', HttpStatus.SERVICE_UNAVAILABLE);
    await this.outreach.update({ listingId: listing.id }, {
      claimCodeHash: this.codeHash(listing.id, code), claimCodeExpiresAt: new Date(now.getTime() + CODE_TTL_MS), claimCodeAttempts: 0,
      claimCodesSent: row.claimCodesSent + 1, claimCodeWindowAt: row.claimCodeWindowAt, claimCodeSentAt: now,
    });
    await this.events.insert({ listingId: listing.id, kind: OutreachEventKind.CODE_SENT, note: `${channel} to ${target.masked}`, byUserId: null });
    return { sentTo: target.masked, channel, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  async verifyCode(listingId: string, code: string, now = new Date()) {
    const listing = await this.listing(listingId);
    if (listing.providerId) throw new ConflictException('This facility has already been claimed.');
    const row = await this.outreach.createQueryBuilder('o').addSelect('o.claimCodeHash').where('o.listingId = :id', { id: listing.id }).getOne();
    const clean = String(code ?? '').replace(/\D/g, '');
    if (!row?.claimCodeHash || !row.claimCodeExpiresAt || row.claimCodeExpiresAt.getTime() < now.getTime()) throw new BadRequestException('This code has been used or has expired. Ask for a new one.');
    if (row.claimCodeAttempts >= MAX_ATTEMPTS) throw new BadRequestException('Too many wrong tries. Ask for a new code.');
    const ok = clean.length === 6 && safeEqual(row.claimCodeHash, this.codeHash(listing.id, clean));
    if (!ok) {
      await this.outreach.update({ listingId: listing.id }, { claimCodeAttempts: row.claimCodeAttempts + 1 });
      const left = MAX_ATTEMPTS - row.claimCodeAttempts - 1;
      throw new BadRequestException(left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code isn’t right. Ask for a new code.');
    }
    const via = (await this.events.findOne({ where: { listingId: listing.id, kind: OutreachEventKind.CODE_SENT }, order: { createdAt: 'DESC' } }))?.note?.split(' ')[0] ?? null;
    await this.outreach.update({ listingId: listing.id }, { claimCodeHash: null, claimCodeExpiresAt: null, claimCodeAttempts: 0, ownershipVerifiedAt: now, ownershipVerifiedVia: via });
    await this.events.insert({ listingId: listing.id, kind: OutreachEventKind.OWNERSHIP_VERIFIED, note: via ? `Code confirmed by ${via}` : 'Code confirmed', byUserId: null });
    const token = await this.outreachService.issueClaimToken(listing.id);
    return { claimToken: token, registryVerified: listing.registryVerified };
  }

  /**
   * Where a code may go. Registry facilities: only the contacts the registry holds. Facilities
   * from elsewhere: the contacts we have on file (those claims still get a staff licence check).
   */
  channels(listing: PartnerFacilityListing, row: { phone: string | null; email: string | null; whatsapp: string | null }) {
    const fromRegistry = listing.source === NHFR_SOURCE;
    const phone = fromRegistry ? listing.registryPhone : (row.phone ?? null);
    const email = fromRegistry ? listing.registryEmail : (row.email ?? null);
    const waNumber = fromRegistry ? listing.registryPhone : (row.whatsapp ?? row.phone ?? null);
    const out: { channel: CodeChannel; to: string; masked: string }[] = [];
    const mobile = phone ? normalizePhone(listing.countryCode, phone) : null;
    if (waNumber && this.whatsappReady()) {
      const wa = normalizePhone(listing.countryCode, waNumber);
      if (wa) out.push({ channel: 'WHATSAPP', to: wa, masked: maskPhone(wa) });
    }
    if (mobile && this.sms) out.push({ channel: 'SMS', to: mobile, masked: maskPhone(mobile) });
    if (email && this.email) out.push({ channel: 'EMAIL', to: email, masked: maskEmail(email) });
    return out;
  }

  private whatsappReady(): boolean {
    return this.config?.get('WHATSAPP_ENABLED') === 'true' && Boolean(this.config?.get('FACILITY_CLAIM_CODE_WHATSAPP_TEMPLATE')) && Boolean(this.whatsapp?.sendTemplate);
  }

  private async deliver(channel: CodeChannel, to: string, name: string, code: string): Promise<boolean> {
    const text = `${code} is your SmartClinic code to claim ${name}. It expires in 10 minutes. If you didn't ask for it, ignore this message.`;
    try {
      if (channel === 'SMS') return Boolean(this.sms && (await this.sms.send(to, text.slice(0, 300))));
      if (channel === 'WHATSAPP') {
        // Meta "authentication" template: body {{1}} is the code, plus the copy-code button.
        await this.whatsapp!.sendTemplate!({ to, template: String(this.config!.get('FACILITY_CLAIM_CODE_WHATSAPP_TEMPLATE')), language: 'en', bodyParams: [code], codeButton: code });
        return true;
      }
      if (!this.email) return false;
      const rendered = renderTransactionalEmail({
        preheader: `Your code is ${code}`,
        title: `Your code to claim ${name}`,
        body: [`Enter this code on SmartClinic to confirm you manage ${name}:`, code, 'It expires in 10 minutes. If you didn’t ask for it, you can ignore this email; nothing changes.'],
        footerNote: 'We sent this to the email address registered for this facility in the national Health Facility Registry.',
      }, { logoUrl: this.app.email.logoUrl });
      const r = await this.email.sendTransactionalEmail({
        to, fromAddress: this.app.email.fromAddress, fromName: this.app.email.fromName, subject: sanitizeEmailSubject(`${code} is your SmartClinic code`),
        html: rendered.html, text: rendered.text, idempotencyKey: `facility-claim-code:${createHash('sha256').update(`${to}:${code}`).digest('hex').slice(0, 24)}`,
      });
      return r.outcome === EmailSendOutcome.SENT;
    } catch {
      this.logger.warn(`Claim code delivery failed (${channel})`);
      return false;
    }
  }

  /** Keyed with the server secret, so a copied database doesn't give the codes away. */
  private codeHash(listingId: string, code: string): string {
    return createHmac('sha256', `${this.app.auth.jwtSecret}:facility-claim-code`).update(`${listingId}:${code}`).digest('hex');
  }

  private async listing(id: string) {
    const listing = await this.listings.findOne({ where: { id, active: true } });
    if (!listing) throw new NotFoundException('Facility not found');
    return listing;
  }

  private async row(listingId: string): Promise<FacilityOutreach> {
    const row = await this.outreach.findOne({ where: { listingId } });
    if (row) return row;
    return this.outreach.save(this.outreach.create({ listingId, status: OutreachStatus.LISTED, invitesSent: 0, reminderStage: 0, phone: null, whatsapp: null, email: null, website: null, address: null, contactName: null, claimTokenHash: null, claimTokenCreatedAt: null, claimedAt: null, lastContactAt: null, nextReminderAt: null, claimCodeAttempts: 0, claimCodesSent: 0 }));
  }
}


function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
