import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, IsNull, LessThan, Repository } from "typeorm";
import { PRIVATE_ATTACHMENT_STORAGE, PrivateAttachmentStorage, StoredPrivateAttachment } from '../common/storage/private-attachment-storage';
import { UploadedPrivateFile, validatePrivateAttachmentFile } from '../common/storage/private-attachment-file';
import { CareAppointment } from "../care-appointments/entities/care-appointment.entity";
import { CareAppointmentStatus } from "../care-appointments/enums/care-appointment-status.enum";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { Patient } from "../patients/entities/patient.entity";
import { PatientStatus } from "../patients/enums/patient-status.enum";
import { CurrentProviderService } from "../providers/current-provider.service";
import { Provider } from "../providers/entities/provider.entity";
import { User } from "../users/entities/user.entity";
import { careChatPolicy } from "./care-chat-policy";
import {
  generateCareConversationReference,
  generateCareMessageReference,
} from "./care-chat-reference";
import { CareMessageListQueryDto } from "./dto/care-chat.dto";
import { CareConversation } from "./entities/care-conversation.entity";
import { CareMessage } from "./entities/care-message.entity";
import { CareMessageSenderType } from "./enums/care-message-sender-type.enum";
import { CareMessageAttachment } from './entities/care-message-attachment.entity';
import { generateCareMessageAttachmentReference } from './care-message-attachment-reference';

type ChatActor = {
  type: CareMessageSenderType;
  userId: string;
  patientId?: string;
  providerId?: string;
};
const CURRENT_APPOINTMENTS = [
  CareAppointmentStatus.SCHEDULED,
  CareAppointmentStatus.CONFIRMED,
  CareAppointmentStatus.IN_PROGRESS,
];

@Injectable()
export class CareChatService {
  constructor(
    @InjectRepository(CareConversation)
    private readonly conversations: Repository<CareConversation>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
    @InjectRepository(CareMessageAttachment) private readonly attachments: Repository<CareMessageAttachment>,
    @Inject(PRIVATE_ATTACHMENT_STORAGE) private readonly storage: PrivateAttachmentStorage,
  ) {}

  async openPatient(user: User, reference: string) {
    return this.open(await this.patientActor(user), reference);
  }
  async openProvider(user: User, reference: string) {
    return this.open(await this.providerActor(user), reference);
  }
  async messagesPatient(
    user: User,
    reference: string,
    query: CareMessageListQueryDto,
  ) {
    return this.messages(await this.patientActor(user), reference, query);
  }
  async messagesProvider(
    user: User,
    reference: string,
    query: CareMessageListQueryDto,
  ) {
    return this.messages(await this.providerActor(user), reference, query);
  }
  async sendPatient(user: User, reference: string, body?: string, attachmentReferences: string[] = []) {
    return this.send(await this.patientActor(user), reference, body, attachmentReferences);
  }
  async sendProvider(user: User, reference: string, body?: string, attachmentReferences: string[] = []) {
    return this.send(await this.providerActor(user), reference, body, attachmentReferences);
  }
  async uploadPatient(user: User, reference: string, file?: UploadedPrivateFile) { return this.upload(await this.patientActor(user), reference, file); }
  async uploadProvider(user: User, reference: string, file?: UploadedPrivateFile) { return this.upload(await this.providerActor(user), reference, file); }
  async accessPatient(user: User, reference: string, messageReference: string, attachmentReference: string) { return this.access(await this.patientActor(user), reference, messageReference, attachmentReference); }
  async accessProvider(user: User, reference: string, messageReference: string, attachmentReference: string) { return this.access(await this.providerActor(user), reference, messageReference, attachmentReference); }
  async readPatient(user: User, reference: string) {
    return this.markRead(await this.patientActor(user), reference);
  }
  async readProvider(user: User, reference: string) {
    return this.markRead(await this.providerActor(user), reference);
  }

  private async open(actor: ChatActor, reference: string) {
    const context = await this.conversations.manager.transaction((manager) =>
      this.requireConversation(manager, actor, reference),
    );
    return this.detail(context.care, context.conversation, actor);
  }

  private async messages(
    actor: ChatActor,
    reference: string,
    query: CareMessageListQueryDto,
  ) {
    const context = await this.conversations.manager.transaction((manager) =>
      this.requireConversation(manager, actor, reference),
    );
    const builder = this.conversations.manager
      .getRepository(CareMessage)
      .createQueryBuilder("message")
      .leftJoinAndSelect('message.attachments', 'attachment')
      .where("message.conversationId = :conversationId", {
        conversationId: context.conversation.id,
      })
      .orderBy("message.createdAt", "DESC")
      .addOrderBy("message.reference", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    return {
      items: rows.map((message) => this.mapMessage(message)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total ? Math.ceil(total / query.limit) : 0,
    };
  }

  private async send(actor: ChatActor, reference: string, body?: string, attachmentReferences: string[] = []) {
    const normalizedBody = typeof body === 'string' ? body.trim() || null : null;
    if (!normalizedBody && attachmentReferences.length === 0) throw new ConflictException('A Care Message requires text or at least one attachment');
    if (attachmentReferences.length > 5 || new Set(attachmentReferences).size !== attachmentReferences.length) throw new ConflictException('A Care Message supports at most five unique attachments');
    return this.conversations.manager.transaction(async (manager) => {
      const context = await this.requireConversation(manager, actor, reference);
      if (!careChatPolicy.canSend(context.care.status))
        throw new ConflictException(
          `Care Chat is read-only while the Care Request is ${context.care.status}`,
        );
      const repository = manager.getRepository(CareMessage);
      const pending = attachmentReferences.length ? await manager.getRepository(CareMessageAttachment).find({ where: { reference: In(attachmentReferences) }, lock: { mode: 'pessimistic_write' } }) : [];
      if (pending.length !== attachmentReferences.length) throw new ConflictException('One or more Care Chat attachments are unavailable');
      const now = new Date();
      for (const attachment of pending) {
        if (attachment.conversationId !== context.conversation.id || attachment.uploadedByUserId !== actor.userId) throw new ConflictException('Care Chat attachment does not belong to this sender and conversation');
        if (attachment.careMessageId) throw new ConflictException('Care Chat attachment has already been sent');
        if (!attachment.expiresAt || attachment.expiresAt <= now) throw new ConflictException('Care Chat attachment has expired');
      }
      const message = await repository.save(
        repository.create({
          reference: generateCareMessageReference(),
          conversationId: context.conversation.id,
          senderType: actor.type,
          senderUserId: actor.userId,
          body: normalizedBody,
          readAt: null,
        }),
      );
      for (const attachment of pending) { attachment.careMessageId = message.id; attachment.expiresAt = null; }
      if (pending.length) await manager.getRepository(CareMessageAttachment).save(pending);
      message.attachments = pending;
      context.conversation.updatedAt = new Date();
      await manager.getRepository(CareConversation).save(context.conversation);
      return this.mapMessage(message);
    });
  }

  private async upload(actor: ChatActor, reference: string, file?: UploadedPrivateFile) {
    const checked = validatePrivateAttachmentFile(file); let stored: StoredPrivateAttachment | null = null;
    try {
      return await this.conversations.manager.transaction(async (manager) => {
        const context = await this.requireConversation(manager, actor, reference);
        if (!careChatPolicy.canSend(context.care.status)) throw new ConflictException(`Care Chat is read-only while the Care Request is ${context.care.status}`);
        await this.cleanupExpired(manager, context.conversation.id);
        stored = await this.storage.upload({ buffer: checked.buffer, mimeType: checked.mimeType, resourceType: checked.resourceType, namespace: 'care-chat' });
        const repository = manager.getRepository(CareMessageAttachment); const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const attachment = await repository.save(repository.create({ reference: generateCareMessageAttachmentReference(), conversationId: context.conversation.id, careMessageId: null, uploadedByUserId: actor.userId, originalName: checked.originalName, mimeType: checked.mimeType, sizeBytes: checked.size, resourceType: checked.resourceType, storageProvider: 'CLOUDINARY', storagePublicId: stored.publicId, storageResourceType: stored.storageResourceType, storageVersion: stored.version, storageFormat: stored.format, expiresAt }));
        return this.mapAttachment(attachment);
      });
    } catch (error) { if (stored) await Promise.resolve(this.storage.delete(stored)).catch(() => undefined); throw error; }
  }

  private async access(actor: ChatActor, reference: string, messageReference: string, attachmentReference: string) {
    return this.conversations.manager.transaction(async (manager) => {
      const context = await this.requireConversation(manager, actor, reference);
      const message = await manager.getRepository(CareMessage).findOne({ where: { reference: messageReference, conversationId: context.conversation.id } });
      if (!message) throw new NotFoundException('Care Message attachment was not found');
      const attachment = await manager.getRepository(CareMessageAttachment).findOne({ where: { reference: attachmentReference, careMessageId: message.id, conversationId: context.conversation.id } });
      if (!attachment) throw new NotFoundException('Care Message attachment was not found');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); return { url: await this.storage.createAccessUrl(this.stored(attachment), expiresAt), expiresAt };
    });
  }

  private async cleanupExpired(manager: EntityManager, conversationId: string) {
    const repository = manager.getRepository(CareMessageAttachment); const rows = await repository.find({ where: { conversationId, careMessageId: IsNull(), expiresAt: LessThan(new Date()) }, lock: { mode: 'pessimistic_write' } });
    for (const row of rows) { try { await this.storage.delete(this.stored(row)); await repository.remove(row); } catch { /* retained for a later opportunistic retry */ } }
  }

  private async markRead(actor: ChatActor, reference: string) {
    return this.conversations.manager.transaction(async (manager) => {
      const context = await this.requireConversation(manager, actor, reference);
      const other =
        actor.type === CareMessageSenderType.PATIENT
          ? CareMessageSenderType.PROVIDER
          : CareMessageSenderType.PATIENT;
      const result = await manager
        .getRepository(CareMessage)
        .createQueryBuilder()
        .update(CareMessage)
        .set({ readAt: () => "CURRENT_TIMESTAMP" })
        .where("conversation_id = :conversationId", {
          conversationId: context.conversation.id,
        })
        .andWhere("sender_type = :other", { other })
        .andWhere("read_at IS NULL")
        .execute();
      return {
        conversationReference: context.conversation.reference,
        markedRead: result.affected ?? 0,
        unreadCount: 0,
      };
    });
  }

  private async requireConversation(
    manager: EntityManager,
    actor: ChatActor,
    reference: string,
  ) {
    const repository = manager.getRepository(CareRequest);
    const where =
      actor.type === CareMessageSenderType.PATIENT
        ? { reference, patientId: actor.patientId! }
        : { reference, assignedProviderId: actor.providerId! };
    const care = await repository.findOne({
      where,
      lock: { mode: "pessimistic_write" },
    });
    if (!care) throw new NotFoundException("Care Request was not found");
    if (!careChatPolicy.canReadExisting(care.status))
      throw new ConflictException(
        `Care Chat is unavailable while the Care Request is ${care.status}`,
      );
    if (!care.assignedProviderId)
      throw new ConflictException("Care Request has no assigned Provider");
    let conversation = await manager
      .getRepository(CareConversation)
      .findOne({
        where: { careRequestId: care.id },
        lock: { mode: "pessimistic_write" },
      });
    if (!conversation) {
      if (!careChatPolicy.canCreate(care.status))
        throw new ConflictException(
          `Care Chat was not opened before the Care Request became ${care.status}`,
        );
      const conversations = manager.getRepository(CareConversation);
      conversation = await conversations.save(
        conversations.create({
          reference: generateCareConversationReference(),
          careRequestId: care.id,
          patientId: care.patientId,
          providerId: care.assignedProviderId,
        }),
      );
    } else if (conversation.providerId !== care.assignedProviderId) {
      conversation.providerId = care.assignedProviderId;
      conversation = await manager
        .getRepository(CareConversation)
        .save(conversation);
    }
    return { care, conversation };
  }

  private async detail(
    care: CareRequest,
    conversation: CareConversation,
    actor: ChatActor,
  ) {
    const [provider, patient, unreadCount, appointment] = await Promise.all([
      this.conversations.manager
        .getRepository(Provider)
        .findOne({
          where: { id: care.assignedProviderId! },
          withDeleted: true,
        }),
      this.conversations.manager
        .getRepository(Patient)
        .findOne({ where: { id: care.patientId }, withDeleted: true }),
      this.conversations.manager
        .getRepository(CareMessage)
        .count({
          where: {
            conversationId: conversation.id,
            senderType:
              actor.type === CareMessageSenderType.PATIENT
                ? CareMessageSenderType.PROVIDER
                : CareMessageSenderType.PATIENT,
            readAt: IsNull(),
          },
        }),
      this.currentAppointment(care.id),
    ]);
    if (!provider || !patient)
      throw new ConflictException("Care Chat participants are unavailable");
    const participant =
      actor.type === CareMessageSenderType.PATIENT
        ? {
            providerReference: provider.providerReference,
            displayName: provider.displayName,
            providerType: provider.providerType,
          }
        : { displayName: this.patientDisplayName(patient) };
    return {
      conversationReference: conversation.reference,
      careRequestReference: care.reference,
      canSendMessages: careChatPolicy.canSend(care.status),
      unreadCount,
      participant,
      appointment,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private async currentAppointment(careRequestId: string) {
    const appointment = await this.conversations.manager
      .getRepository(CareAppointment)
      .createQueryBuilder("appointment")
      .where("appointment.careRequestId = :careRequestId", { careRequestId })
      .orderBy(
        `CASE WHEN appointment.status IN (:...currentStatuses) THEN 0 ELSE 1 END`,
        "ASC",
      )
      .addOrderBy("appointment.createdAt", "DESC")
      .addOrderBy("appointment.reference", "DESC")
      .setParameter("currentStatuses", CURRENT_APPOINTMENTS)
      .getOne();
    return appointment
      ? {
          reference: appointment.reference,
          status: appointment.status,
          scheduledDate: appointment.scheduledDate,
          scheduledTimeFrom: appointment.scheduledTimeFrom,
          scheduledTimeTo: appointment.scheduledTimeTo,
          timezone: appointment.timezone,
          deliveryMode: appointment.deliveryMode,
        }
      : null;
  }

  private mapMessage(message: CareMessage) {
    return {
      reference: message.reference,
      senderType: message.senderType,
      body: message.body,
      createdAt: message.createdAt,
      readAt: message.readAt,
      attachments: (message.attachments ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.reference.localeCompare(b.reference)).map((attachment) => this.mapAttachment(attachment)),
    };
  }
  private mapAttachment(attachment: CareMessageAttachment) { return { reference: attachment.reference, originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, resourceType: attachment.resourceType, createdAt: attachment.createdAt, ...(attachment.careMessageId === null ? { expiresAt: attachment.expiresAt } : {}) }; }
  private stored(row: CareMessageAttachment): StoredPrivateAttachment { return { publicId: row.storagePublicId, storageResourceType: row.storageResourceType, version: row.storageVersion, format: row.storageFormat }; }
  private patientDisplayName(patient: Patient) {
    const familyInitial = patient.familyName.trim().charAt(0);
    return familyInitial
      ? `${patient.givenName.trim()} ${familyInitial}.`
      : patient.givenName.trim();
  }
  private async patientActor(user: User): Promise<ChatActor> {
    const patient = await this.patients.findOne({
      where: { userId: user.id },
      withDeleted: true,
    });
    if (
      !patient ||
      patient.deletedAt ||
      patient.status !== PatientStatus.ACTIVE
    )
      throw new NotFoundException("Patient profile was not found");
    return {
      type: CareMessageSenderType.PATIENT,
      userId: user.id,
      patientId: patient.id,
    };
  }
  private async providerActor(user: User): Promise<ChatActor> {
    const provider = await this.currentProvider.resolveOperational(user);
    return {
      type: CareMessageSenderType.PROVIDER,
      userId: user.id,
      providerId: provider.id,
    };
  }
}
