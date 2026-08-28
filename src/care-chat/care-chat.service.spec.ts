import { ConflictException, NotFoundException } from '@nestjs/common';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';
import { Patient } from '../patients/entities/patient.entity';
import { Provider } from '../providers/entities/provider.entity';
import { CareChatService } from './care-chat.service';
import { CareConversation } from './entities/care-conversation.entity';
import { CareMessage } from './entities/care-message.entity';
import { CareMessageSenderType } from './enums/care-message-sender-type.enum';

describe('CareChatService', () => {
  const patientUser: any = { id: 'patient-user' }; const providerUser: any = { id: 'provider-user' };
  const patient: any = { id: 'patient-id', userId: patientUser.id, givenName: 'Ada', familyName: 'Okafor', status: 'ACTIVE', deletedAt: null };
  const provider: any = { id: 'provider-id', userId: providerUser.id, providerReference: 'SCPR-ABCDEF0123456789', displayName: 'Ikeja Clinic', providerType: 'CLINIC', status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null };
  let care: any; let conversation: any; let messages: any[]; let manager: any; let subject: CareChatService; let selectQb: any; let updateQb: any;

  beforeEach(() => {
    care = { id: 'care-id', reference: 'SC-CARE-ABCDEF123456', patientId: patient.id, assignedProviderId: provider.id, status: CareRequestStatus.PROVIDER_ACCEPTED };
    conversation = null; messages = [];
    const patientRepo = { findOne: jest.fn(async ({ where }: any) => where.userId === patientUser.id ? patient : where.id === patient.id ? patient : null) };
    const providerRepo = { findOne: jest.fn().mockResolvedValue(provider) };
    const careRepo = { findOne: jest.fn(async ({ where }: any) => where.reference === care.reference && (where.patientId === patient.id || where.assignedProviderId === provider.id) ? care : null) };
    const conversationRepo = { findOne: jest.fn(async () => conversation), create: jest.fn((value) => ({ id: 'conversation-id', createdAt: new Date(), updatedAt: new Date(), ...value })), save: jest.fn(async (value) => { conversation = value; return value; }) };
    selectQb = {}; for (const method of ['where', 'orderBy', 'addOrderBy', 'skip', 'take']) selectQb[method] = jest.fn().mockReturnValue(selectQb); selectQb.getManyAndCount = jest.fn(async () => [messages, messages.length]);
    updateQb = {}; for (const method of ['update', 'set', 'where', 'andWhere']) updateQb[method] = jest.fn().mockReturnValue(updateQb); updateQb.execute = jest.fn().mockResolvedValue({ affected: 2 });
    const messageRepo = { create: jest.fn((value) => ({ id: `message-${messages.length + 1}`, createdAt: new Date(), ...value })), save: jest.fn(async (value) => { messages.push(value); return value; }), count: jest.fn(async ({ where }: any) => messages.filter((message) => message.conversationId === where.conversationId && message.senderType === where.senderType && !message.readAt).length), createQueryBuilder: jest.fn((alias?: string) => alias ? selectQb : updateQb) };
    const appointmentQb: any = {}; for (const method of ['where', 'orderBy', 'addOrderBy', 'setParameter']) appointmentQb[method] = jest.fn().mockReturnValue(appointmentQb); appointmentQb.getOne = jest.fn().mockResolvedValue(null);
    const appointmentRepo = { createQueryBuilder: jest.fn().mockReturnValue(appointmentQb) };
    manager = { transaction: jest.fn(async (work) => work(manager)), getRepository: jest.fn((entity) => entity === CareRequest ? careRepo : entity === CareConversation ? conversationRepo : entity === CareMessage ? messageRepo : entity === Provider ? providerRepo : entity === Patient ? patientRepo : entity === CareAppointment ? appointmentRepo : {}) };
    subject = new CareChatService({ manager } as any, patientRepo as any, { resolve: jest.fn(async (user) => user.id === providerUser.id ? provider : { ...provider, id: 'old-provider' }) } as any);
  });

  it('lazily creates exactly one conversation for the accepted patient/provider without requiring an appointment', async () => {
    const patientChat: any = await subject.openPatient(patientUser, care.reference);
    const providerChat: any = await subject.openProvider(providerUser, care.reference);
    expect(patientChat).toMatchObject({ careRequestReference: care.reference, canSendMessages: true, appointment: null, participant: { providerReference: provider.providerReference } });
    expect(providerChat).toMatchObject({ conversationReference: patientChat.conversationReference, participant: { displayName: 'Ada O.' } });
    expect(manager.getRepository(CareConversation).save).toHaveBeenCalledTimes(1);
  });

  it('centralizes unavailable and read-only lifecycle behavior', async () => {
    care.status = CareRequestStatus.MATCHING;
    await expect(subject.openPatient(patientUser, care.reference)).rejects.toBeInstanceOf(ConflictException);
    care.status = CareRequestStatus.COMPLETED;
    await expect(subject.openPatient(patientUser, care.reference)).rejects.toBeInstanceOf(ConflictException);
    conversation = { id: 'conversation-id', reference: 'SC-CHAT-ABCDEF123456', careRequestId: care.id, patientId: patient.id, providerId: provider.id, createdAt: new Date(), updatedAt: new Date() };
    await expect(subject.openPatient(patientUser, care.reference)).resolves.toMatchObject({ canSendMessages: false });
    await expect(subject.sendPatient(patientUser, care.reference, 'Hello')).rejects.toBeInstanceOf(ConflictException);
  });

  it('derives immutable sender identity and returns no internal sender or message IDs', async () => {
    const patientMessage: any = await subject.sendPatient(patientUser, care.reference, 'Hello Provider');
    const providerMessage: any = await subject.sendProvider(providerUser, care.reference, 'Hello Ada');
    expect(patientMessage).toMatchObject({ senderType: CareMessageSenderType.PATIENT, body: 'Hello Provider' });
    expect(providerMessage).toMatchObject({ senderType: CareMessageSenderType.PROVIDER, body: 'Hello Ada' });
    expect(JSON.stringify([patientMessage, providerMessage])).not.toContain('senderUserId');
    expect(JSON.stringify([patientMessage, providerMessage])).not.toContain('message-');
  });

  it('uses narrow patient/current-provider ownership and removes old provider access', async () => {
    await expect(subject.openPatient({ id: 'other-user' } as any, care.reference)).rejects.toBeInstanceOf(NotFoundException);
    await expect(subject.openProvider({ id: 'old-provider-user' } as any, care.reference)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('paginates newest-first with a stable public-reference tie-break and safe message DTOs', async () => {
    conversation = { id: 'conversation-id', reference: 'SC-CHAT-ABCDEF123456', careRequestId: care.id, patientId: patient.id, providerId: provider.id };
    messages.push({ id: 'secret-id', reference: 'SC-MSG-ABCDEF123456', conversationId: conversation.id, senderType: CareMessageSenderType.PROVIDER, senderUserId: providerUser.id, body: '<script>alert(1)</script>', createdAt: new Date(), readAt: null });
    const result: any = await subject.messagesPatient(patientUser, care.reference, { page: 1, limit: 50 });
    expect(selectQb.orderBy).toHaveBeenCalledWith('message.createdAt', 'DESC'); expect(selectQb.addOrderBy).toHaveBeenCalledWith('message.reference', 'DESC');
    expect(result.items[0]).toEqual({ reference: 'SC-MSG-ABCDEF123456', senderType: CareMessageSenderType.PROVIDER, body: '<script>alert(1)</script>', createdAt: expect.any(Date), readAt: null });
  });

  it('marks only the other participant messages and reports authoritative unread counts', async () => {
    conversation = { id: 'conversation-id', reference: 'SC-CHAT-ABCDEF123456', careRequestId: care.id, patientId: patient.id, providerId: provider.id };
    await expect(subject.readPatient(patientUser, care.reference)).resolves.toEqual({ conversationReference: conversation.reference, markedRead: 2, unreadCount: 0 });
    expect(updateQb.andWhere).toHaveBeenCalledWith('sender_type = :other', { other: CareMessageSenderType.PROVIDER });
    expect(updateQb.andWhere).toHaveBeenCalledWith('read_at IS NULL');
  });
});
