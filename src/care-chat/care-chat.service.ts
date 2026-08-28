import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
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
  async sendPatient(user: User, reference: string, body: string) {
    return this.send(await this.patientActor(user), reference, body);
  }
  async sendProvider(user: User, reference: string, body: string) {
    return this.send(await this.providerActor(user), reference, body);
  }
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

  private async send(actor: ChatActor, reference: string, body: string) {
    return this.conversations.manager.transaction(async (manager) => {
      const context = await this.requireConversation(manager, actor, reference);
      if (!careChatPolicy.canSend(context.care.status))
        throw new ConflictException(
          `Care Chat is read-only while the Care Request is ${context.care.status}`,
        );
      const repository = manager.getRepository(CareMessage);
      const message = await repository.save(
        repository.create({
          reference: generateCareMessageReference(),
          conversationId: context.conversation.id,
          senderType: actor.type,
          senderUserId: actor.userId,
          body,
          readAt: null,
        }),
      );
      context.conversation.updatedAt = new Date();
      await manager.getRepository(CareConversation).save(context.conversation);
      return this.mapMessage(message);
    });
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
    };
  }
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
