import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { appConfig } from '../config/app.config';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { normalizePhoneNumber } from '../users/phone-normalization';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './adapters/whatsapp-provider.interface';
import { WhatsAppIdentity } from './entities/whatsapp-identity.entity';
import { WhatsAppMessage } from './entities/whatsapp-message.entity';
import { MetaInboundMessage, MetaWebhookPayload, WhatsAppIdentityStatus, WhatsAppMessageDirection, WhatsAppMessageStatus, WhatsAppProviderCode } from './whatsapp.types';

const NEW_USER_MESSAGE = 'Welcome to SmartClinic 👋\n\nAccess health checks, verified care providers and SmartClinic services from one place.\n\nGet Started';
const existingPatientMessage = (givenName: string) => `Welcome back, ${givenName} 👋\n\nWhat would you like to do?\n\nFind Care\nBook a Health Check\nFastTrack\nGuided Self-Check\nMy SmartClinic`;

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  constructor(
    @InjectRepository(WhatsAppIdentity) private readonly identities: Repository<WhatsAppIdentity>,
    @InjectRepository(WhatsAppMessage) private readonly messages: Repository<WhatsAppMessage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  verifyChallenge(mode?: string, token?: string, challenge?: string): string {
    const expected = this.config.whatsapp.webhookVerifyToken;
    if (mode !== 'subscribe' || !expected || token !== expected || !challenge) throw new ForbiddenException('WhatsApp webhook verification failed');
    return challenge;
  }

  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.config.whatsapp.appSecret) return true;
    return !!rawBody && !!signature && this.provider.verifyWebhookSignature(rawBody, signature);
  }

  extractMessages(payload: MetaWebhookPayload): MetaInboundMessage[] {
    if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return [];
    const result: MetaInboundMessage[] = [];
    for (const entry of payload.entry) for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const message of change.value?.messages ?? []) {
        if (typeof message.id !== 'string' || typeof message.from !== 'string' || !['text', 'interactive'].includes(String(message.type))) continue;
        const timestamp = typeof message.timestamp === 'string' && /^\d+$/.test(message.timestamp) ? new Date(Number(message.timestamp) * 1000) : new Date();
        result.push({ providerMessageId: message.id, providerUserId: message.from, messageType: String(message.type), occurredAt: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp });
      }
    }
    return result;
  }

  async processWebhook(payload: MetaWebhookPayload): Promise<void> {
    for (const message of this.extractMessages(payload)) await this.processMessage(message);
  }

  private async processMessage(message: MetaInboundMessage): Promise<void> {
    const phoneNormalized = normalizePhoneNumber(message.providerUserId);
    if (!phoneNormalized) { this.logger.warn('Ignored WhatsApp message with an invalid sender identifier'); return; }
    let identity = await this.identities.findOne({ where: [{ provider: WhatsAppProviderCode.META, providerUserId: message.providerUserId }, { provider: WhatsAppProviderCode.META, phoneNormalized }] });
    const now = new Date();
    if (!identity) {
      identity = await this.identities.save(this.identities.create({ provider: WhatsAppProviderCode.META, providerUserId: message.providerUserId, phoneNormalized, userId: null, patientId: null, status: WhatsAppIdentityStatus.UNLINKED, firstSeenAt: now, lastSeenAt: now, linkedAt: null }));
    }
    if (identity.status === WhatsAppIdentityStatus.DISABLED) return;
    const alreadyProcessed = await this.messages.findOne({ where: { provider: WhatsAppProviderCode.META, providerMessageId: message.providerMessageId } });
    if (alreadyProcessed) return;
    try {
      await this.messages.save(this.messages.create({ identityId: identity.id, provider: WhatsAppProviderCode.META, direction: WhatsAppMessageDirection.INBOUND, providerMessageId: message.providerMessageId, messageType: message.messageType, status: WhatsAppMessageStatus.RECEIVED, occurredAt: message.occurredAt }));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') return;
      throw error;
    }
    identity.lastSeenAt = now;
    const patient = await this.resolvePatient(identity, now);
    await this.identities.save(identity);
    const text = patient ? existingPatientMessage(patient.givenName) : NEW_USER_MESSAGE;
    try {
      const sent = await this.provider.sendText({ to: identity.phoneNormalized, text });
      await this.messages.save(this.messages.create({ identityId: identity.id, provider: WhatsAppProviderCode.META, direction: WhatsAppMessageDirection.OUTBOUND, providerMessageId: sent.providerMessageId, messageType: 'text', status: WhatsAppMessageStatus.SENT, occurredAt: new Date() }));
    } catch {
      await this.messages.save(this.messages.create({ identityId: identity.id, provider: WhatsAppProviderCode.META, direction: WhatsAppMessageDirection.OUTBOUND, providerMessageId: null, messageType: 'text', status: WhatsAppMessageStatus.FAILED, occurredAt: new Date() }));
      this.logger.error('WhatsApp response delivery failed');
    }
  }

  private async resolvePatient(identity: WhatsAppIdentity, now: Date): Promise<Patient | null> {
    if (identity.status === WhatsAppIdentityStatus.LINKED && identity.userId && identity.patientId) {
      const linked = await this.patients.findOne({ where: { id: identity.patientId, userId: identity.userId, status: PatientStatus.ACTIVE }, relations: { user: true } });
      if (linked?.user && this.isEligiblePatientUser(linked.user)) return linked;
      identity.status = WhatsAppIdentityStatus.UNLINKED; identity.userId = null; identity.patientId = null; identity.linkedAt = null;
    }
    const account = await this.users.findOne({ where: { phoneNormalized: identity.phoneNormalized, status: UserStatus.ACTIVE }, relations: { patient: true } });
    if (!account || !this.isEligiblePatientUser(account) || !account.patient || account.patient.status !== PatientStatus.ACTIVE || account.patient.deletedAt) return null;
    identity.status = WhatsAppIdentityStatus.LINKED; identity.userId = account.id; identity.patientId = account.patient.id; identity.linkedAt = now;
    return account.patient;
  }

  private isEligiblePatientUser(user: User): boolean {
    return !user.deletedAt && user.status === UserStatus.ACTIVE && user.roles?.includes(UserRole.USER);
  }
}
