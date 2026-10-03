import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { createAppConfiguration } from '../../config/environment';
import { UploadedPrivateFile, validatePrivateAttachmentFile } from '../../common/storage/private-attachment-file';
import { PRIVATE_ATTACHMENT_STORAGE, PrivateAttachmentStorage } from '../../common/storage/private-attachment-storage';
import { NotificationActionType } from '../../notifications/enums/notification-action-type.enum';
import { NotificationEntityType } from '../../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { User } from '../../users/entities/user.entity';
import { CurrentProviderService } from '../current-provider.service';
import { ProviderOnboardingBlocker } from '../dto/provider-onboarding-readiness.dto';
import { Provider } from '../entities/provider.entity';
import { ProviderType } from '../enums/provider-type.enum';
import { ClinicalSpecialty, CredentialStatus, ProviderCredential, ProviderSpecialty } from './credential.entities';
import { isRegulator, MAX_SPECIALTIES, normaliseLicence, regulatorsFor, REGULATORS, specialtyRequired } from './regulators';

export interface CredentialInput {
  regulator: string;
  licenceNumber: string;
}

const DOCUMENT_LINK_MINUTES = 10;

/** True when private file storage is set up (same storage as clinical attachments). */
function storageConfigured(): boolean {
  try {
    const c = createAppConfiguration().clinicalAttachments;
    return c.provider === 'cloudinary' && Boolean(c.cloudName && c.apiKey && c.apiSecret);
  } catch {
    return false;
  }
}

/**
 * Specialties and licences. A provider can't be approved — and so can't be found or booked — until
 * a doctor has a specialty and staff have checked the licence with the regulator.
 */
@Injectable()
export class ProviderCredentialsService {
  private readonly logger = new Logger(ProviderCredentialsService.name);

  constructor(
    @InjectRepository(ClinicalSpecialty) private readonly specialties: Repository<ClinicalSpecialty>,
    @InjectRepository(ProviderSpecialty) private readonly providerSpecialties: Repository<ProviderSpecialty>,
    @InjectRepository(ProviderCredential) private readonly credentials: Repository<ProviderCredential>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    private readonly current: CurrentProviderService,
    @Optional() @Inject(PRIVATE_ATTACHMENT_STORAGE) private readonly storage?: PrivateAttachmentStorage,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** The specialty list, in display order, grouped for pickers. */
  async catalogue() {
    const rows = await this.specialties.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
    return rows.map((s) => ({ code: s.code, name: s.name, group: s.groupName }));
  }

  regulators(countryCode?: string, type?: ProviderType) {
    return regulatorsFor(countryCode, type).map((r) => ({ code: r.code, name: r.name }));
  }

  // ---- The provider's own view ----

  async mine(user: User) {
    const { provider } = await this.actor(user);
    return this.view(provider);
  }

  async setMySpecialties(user: User, codes: readonly string[], primaryCode?: string | null) {
    const actor = await this.actor(user);
    this.requireManager(actor);
    await this.saveSpecialties(this.providers.manager, actor.provider, codes, primaryCode);
    return this.view(actor.provider);
  }

  async setMyCredential(user: User, input: CredentialInput) {
    const actor = await this.actor(user);
    this.requireManager(actor);
    await this.saveCredential(this.providers.manager, actor.provider, input);
    return this.view(actor.provider);
  }

  async uploadMyDocument(user: User, file?: UploadedPrivateFile) {
    const actor = await this.actor(user);
    this.requireManager(actor);
    if (!this.storage || !storageConfigured()) throw new ConflictException('Document upload is not available yet. Staff can check your number without it.');
    const credential = await this.credentials.findOne({ where: { providerId: actor.provider.id } });
    if (!credential) throw new BadRequestException('Add your licence number first');
    if (credential.status === CredentialStatus.VERIFIED) throw new ConflictException('Your licence is already verified. Contact support to change it.');
    const checked = validatePrivateAttachmentFile(file);
    const stored = await this.storage.upload({ buffer: checked.buffer, mimeType: checked.mimeType, resourceType: checked.resourceType, namespace: 'provider-credentials' });
    const old = credential.documentPublicId ? { publicId: credential.documentPublicId, storageResourceType: credential.documentResourceType ?? 'image', version: credential.documentVersion, format: credential.documentFormat } : null;
    await this.credentials.update({ id: credential.id }, {
      documentPublicId: stored.publicId, documentResourceType: stored.storageResourceType, documentVersion: stored.version, documentFormat: stored.format,
      documentMimeType: checked.mimeType, documentUploadedAt: new Date(),
      status: CredentialStatus.SUBMITTED, submittedAt: new Date(),
    });
    if (old) await this.storage.delete(old).catch(() => this.logger.warn('Old licence document could not be deleted'));
    return this.view(actor.provider);
  }

  // ---- Used at sign-up ----

  async saveAtRegistration(manager: EntityManager, provider: Provider, input: { specialtyCodes?: string[]; primarySpecialty?: string | null; regulator?: string; licenceNumber?: string }) {
    if (input.specialtyCodes?.length) await this.saveSpecialties(manager, provider, input.specialtyCodes, input.primarySpecialty);
    if (input.regulator && input.licenceNumber) await this.saveCredential(manager, provider, { regulator: input.regulator, licenceNumber: input.licenceNumber });
  }

  // ---- Staff ----

  async adminView(providerId: string) {
    const provider = await this.providers.findOne({ where: { id: providerId }, withDeleted: true });
    if (!provider) throw new NotFoundException('Provider not found');
    const base = await this.view(provider);
    const credential = await this.credentials.findOne({ where: { providerId } });
    let documentUrl: string | null = null;
    if (credential?.documentPublicId && this.storage && storageConfigured()) {
      documentUrl = await this.storage
        .createAccessUrl({ publicId: credential.documentPublicId, storageResourceType: credential.documentResourceType ?? 'image', version: credential.documentVersion, format: credential.documentFormat }, new Date(Date.now() + DOCUMENT_LINK_MINUTES * 60_000))
        .catch(() => null);
    }
    const regulator = REGULATORS.find((r) => r.code === credential?.regulator);
    return { ...base, documentUrl, checkUrl: regulator?.checkUrl ?? null, checkedVia: credential?.checkedVia ?? null, reviewNote: credential?.reviewNote ?? null };
  }

  async verify(providerId: string, admin: User, input: { checkedVia: string; note?: string | null }) {
    const credential = await this.credentials.findOne({ where: { providerId } });
    if (!credential) throw new ConflictException('This provider has not added a licence yet');
    const checkedVia = String(input.checkedVia ?? '').trim();
    if (!checkedVia) throw new BadRequestException('Say how you checked it, for example "MDCN online register"');
    await this.credentials.update({ id: credential.id }, {
      status: CredentialStatus.VERIFIED, verifiedAt: new Date(), reviewedByUserId: admin.id,
      checkedVia: checkedVia.slice(0, 120), reviewNote: input.note?.trim().slice(0, 500) || null,
    });
    await this.notify(providerId, NotificationType.PROVIDER_LICENCE_VERIFIED, 'Your licence is verified', 'We checked your licence with the regulator. Patients will see a Verified badge on your profile.', `licence-verified:${credential.id}:${Date.now()}`);
    return this.adminView(providerId);
  }

  async reject(providerId: string, admin: User, reason: string) {
    const credential = await this.credentials.findOne({ where: { providerId } });
    if (!credential) throw new ConflictException('This provider has not added a licence yet');
    const note = String(reason ?? '').trim();
    if (!note) throw new BadRequestException('Tell the provider what to fix');
    await this.credentials.update({ id: credential.id }, { status: CredentialStatus.REJECTED, verifiedAt: null, reviewedByUserId: admin.id, reviewNote: note.slice(0, 500) });
    await this.notify(providerId, NotificationType.PROVIDER_LICENCE_NEEDS_ATTENTION, "We couldn't verify your licence", note.slice(0, 500), `licence-rejected:${credential.id}:${Date.now()}`);
    return this.adminView(providerId);
  }

  // ---- For approval and search ----

  /** What stops approval. Checked by the onboarding readiness service. */
  async blockers(provider: Provider, manager?: EntityManager): Promise<ProviderOnboardingBlocker[]> {
    const specialties = manager?.getRepository(ProviderSpecialty) ?? this.providerSpecialties;
    const credentials = manager?.getRepository(ProviderCredential) ?? this.credentials;
    const out: ProviderOnboardingBlocker[] = [];
    if (specialtyRequired(provider.providerType) && !(await specialties.exists({ where: { providerId: provider.id } }))) out.push(ProviderOnboardingBlocker.SPECIALTY_MISSING);
    const credential = await credentials.findOne({ where: { providerId: provider.id }, select: { id: true, status: true } });
    if (!credential) out.push(ProviderOnboardingBlocker.LICENCE_MISSING);
    else if (credential.status !== CredentialStatus.VERIFIED) out.push(ProviderOnboardingBlocker.LICENCE_NOT_VERIFIED);
    return out;
  }

  /** Specialties and the Verified badge for a list of providers, for search results. */
  async badges(providerIds: readonly string[]): Promise<Map<string, { verified: boolean; specialties: { code: string; name: string; isPrimary: boolean }[] }>> {
    const out = new Map<string, { verified: boolean; specialties: { code: string; name: string; isPrimary: boolean }[] }>();
    if (!providerIds.length) return out;
    const ids = [...new Set(providerIds)];
    for (const id of ids) out.set(id, { verified: false, specialties: [] });
    const [links, creds] = await Promise.all([
      this.providerSpecialties.find({ where: { providerId: In(ids) }, relations: { specialty: true } }),
      this.credentials.find({ where: { providerId: In(ids), status: CredentialStatus.VERIFIED }, select: { providerId: true } }),
    ]);
    for (const l of links) {
      if (!l.specialty?.isActive) continue;
      out.get(l.providerId)!.specialties.push({ code: l.specialty.code, name: l.specialty.name, isPrimary: l.isPrimary });
    }
    for (const v of out.values()) v.specialties.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
    for (const c of creds) out.get(c.providerId)!.verified = true;
    return out;
  }

  // ---- Internals ----

  private async view(provider: Provider) {
    const [links, credential] = await Promise.all([
      this.providerSpecialties.find({ where: { providerId: provider.id }, relations: { specialty: true } }),
      this.credentials.findOne({ where: { providerId: provider.id } }),
    ]);
    return {
      providerType: provider.providerType,
      specialtyRequired: specialtyRequired(provider.providerType),
      maxSpecialties: provider.providerType === ProviderType.INDIVIDUAL ? MAX_SPECIALTIES.person : MAX_SPECIALTIES.facility,
      specialties: links
        .filter((l) => l.specialty)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.specialty.sortOrder - b.specialty.sortOrder)
        .map((l) => ({ code: l.specialty.code, name: l.specialty.name, isPrimary: l.isPrimary })),
      regulators: this.regulators(provider.countryCode ?? undefined, provider.providerType),
      credential: credential
        ? {
            regulator: credential.regulator,
            licenceNumber: credential.licenceNumber,
            status: credential.status,
            hasDocument: Boolean(credential.documentPublicId),
            submittedAt: credential.submittedAt,
            verifiedAt: credential.verifiedAt,
            message: credential.status === CredentialStatus.REJECTED ? credential.reviewNote : null,
          }
        : null,
      verified: credential?.status === CredentialStatus.VERIFIED,
      uploadsAvailable: Boolean(this.storage) && storageConfigured(),
      blockers: await this.blockers(provider),
    };
  }

  private async saveSpecialties(manager: EntityManager, provider: Provider, rawCodes: readonly string[], primaryCode?: string | null) {
    const codes = [...new Set((rawCodes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
    const max = provider.providerType === ProviderType.INDIVIDUAL ? MAX_SPECIALTIES.person : MAX_SPECIALTIES.facility;
    if (codes.length > max) throw new BadRequestException(`Choose up to ${max} specialties`);
    if (specialtyRequired(provider.providerType) && !codes.length) throw new BadRequestException('Choose at least one specialty. General Practice counts.');
    const found = codes.length ? await manager.getRepository(ClinicalSpecialty).find({ where: { code: In(codes), isActive: true } }) : [];
    if (found.length !== codes.length) throw new BadRequestException('Unknown specialty');
    const primary = primaryCode ? String(primaryCode).trim().toUpperCase() : codes[0];
    if (codes.length && !codes.includes(primary)) throw new BadRequestException('Your main specialty must be one of the ones you chose');
    const repo = manager.getRepository(ProviderSpecialty);
    await repo.delete({ providerId: provider.id });
    if (found.length) await repo.insert(found.map((s) => ({ providerId: provider.id, specialtyId: s.id, isPrimary: s.code === primary })));
  }

  private async saveCredential(manager: EntityManager, provider: Provider, input: CredentialInput) {
    const regulator = String(input.regulator ?? '').trim().toUpperCase();
    if (!isRegulator(regulator)) throw new BadRequestException('Choose who issued your licence');
    const licenceNumber = normaliseLicence(input.licenceNumber);
    if (!licenceNumber) throw new BadRequestException('Enter your licence or registration number as it appears on your certificate');
    const repo = manager.getRepository(ProviderCredential);
    const existing = await repo.findOne({ where: { providerId: provider.id } });
    if (existing?.status === CredentialStatus.VERIFIED) {
      if (existing.regulator === regulator && existing.licenceNumber === licenceNumber) return;
      throw new ConflictException('Your licence is already verified. Contact support to change it.');
    }
    const taken = await repo.findOne({ where: { regulator, licenceNumber }, select: { id: true, providerId: true } });
    if (taken && taken.providerId !== provider.id && regulator !== 'OTHER') throw new ConflictException('This licence number is already linked to another SmartClinic account. Contact support if this is yours.');
    await repo.save({
      ...(existing ?? {}),
      providerId: provider.id, regulator, licenceNumber, status: CredentialStatus.SUBMITTED, submittedAt: new Date(),
      verifiedAt: null, reviewNote: existing?.status === CredentialStatus.REJECTED ? existing.reviewNote : null,
    });
    // Keep the old free-text field in step for screens that still read it.
    provider.professionalReference = `${regulator} ${licenceNumber}`.slice(0, 200);
    await manager.getRepository(Provider).update({ id: provider.id }, { professionalReference: provider.professionalReference });
  }

  /** Owner or staff, whatever the provider's status, so a provider under review can still fix details. */
  private async actor(user: User) {
    const actor = await this.current.findActor(user);
    if (!actor || actor.provider.deletedAt) throw new NotFoundException('Provider profile not found');
    return actor;
  }

  private requireManager(actor: { isOwner: boolean; role: string | null }) {
    if (!actor.isOwner && actor.role !== 'ADMIN') throw new ConflictException('Only the account owner or an admin can change licence details');
  }

  private async notify(providerId: string, type: NotificationType, title: string, message: string, idempotencyKey: string) {
    if (!this.notifications) return;
    const provider = await this.providers.findOne({ where: { id: providerId }, select: { id: true, userId: true, providerReference: true } });
    if (!provider?.userId) return;
    await this.providers.manager
      .transaction((manager) =>
        this.notifications!.createTransactionalNotification(manager, {
          userId: provider.userId!,
          type,
          title,
          message,
          entityType: NotificationEntityType.PROVIDER_PROFILE,
          entityReference: provider.providerReference,
          actionType: NotificationActionType.VIEW,
          metadata: { route: '/provider/profile' },
          idempotencyKey,
          email: { enabled: true },
        }),
      )
      .catch(() => this.logger.warn('Licence notification failed'));
  }
}
