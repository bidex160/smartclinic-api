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
import { CareMessageAttachment } from './entities/care-message-attachment.entity';

describe('CareChatService', () => {
  const patientUser: any = { id: 'patient-user' }; const providerUser: any = { id: 'provider-user' };
  const patient: any = { id: 'patient-id', userId: patientUser.id, givenName: 'Ada', familyName: 'Okafor', status: 'ACTIVE', deletedAt: null };
  const provider: any = { id: 'provider-id', userId: providerUser.id, providerReference: 'SCPR-ABCDEF0123456789', displayName: 'Ikeja Clinic', providerType: 'CLINIC', status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null };
  let care: any; let conversation: any; let messages: any[]; let attachments: any[]; let manager: any; let subject: CareChatService; let selectQb: any; let updateQb: any; let storage: any;

  beforeEach(() => {
    care = { id: 'care-id', reference: 'SC-CARE-ABCDEF123456', patientId: patient.id, assignedProviderId: provider.id, status: CareRequestStatus.PROVIDER_ACCEPTED };
    conversation = null; messages = []; attachments = [];
    const patientRepo = { findOne: jest.fn(async ({ where }: any) => where.userId === patientUser.id ? patient : where.id === patient.id ? patient : null) };
    const providerRepo = { findOne: jest.fn().mockResolvedValue(provider) };
    const careRepo = { findOne: jest.fn(async ({ where }: any) => where.reference === care.reference && (where.patientId === patient.id || where.assignedProviderId === provider.id) ? care : null) };
    const conversationRepo = { findOne: jest.fn(async () => conversation), create: jest.fn((value) => ({ id: 'conversation-id', createdAt: new Date(), updatedAt: new Date(), ...value })), save: jest.fn(async (value) => { conversation = value; return value; }) };
    selectQb = {}; for (const method of ['leftJoinAndSelect', 'where', 'orderBy', 'addOrderBy', 'skip', 'take']) selectQb[method] = jest.fn().mockReturnValue(selectQb); selectQb.getManyAndCount = jest.fn(async () => [messages, messages.length]);
    updateQb = {}; for (const method of ['update', 'set', 'where', 'andWhere']) updateQb[method] = jest.fn().mockReturnValue(updateQb); updateQb.execute = jest.fn().mockResolvedValue({ affected: 2 });
    const messageRepo = { create: jest.fn((value) => ({ id: `message-${messages.length + 1}`, createdAt: new Date(), ...value })), save: jest.fn(async (value) => { messages.push(value); return value; }), findOne: jest.fn(async ({ where }: any) => messages.find(message => message.reference === where.reference && message.conversationId === where.conversationId) ?? null), count: jest.fn(async ({ where }: any) => messages.filter((message) => message.conversationId === where.conversationId && message.senderType === where.senderType && !message.readAt).length), createQueryBuilder: jest.fn((alias?: string) => alias ? selectQb : updateQb) };
    const appointmentQb: any = {}; for (const method of ['where', 'orderBy', 'addOrderBy', 'setParameter']) appointmentQb[method] = jest.fn().mockReturnValue(appointmentQb); appointmentQb.getOne = jest.fn().mockResolvedValue(null);
    const appointmentRepo = { createQueryBuilder: jest.fn().mockReturnValue(appointmentQb) };
    const attachmentRepo = { create: jest.fn((value) => ({ id: `attachment-${attachments.length + 1}`, createdAt: new Date(), ...value })), save: jest.fn(async (value) => { const values = Array.isArray(value) ? value : [value]; for (const item of values) if (!attachments.includes(item)) attachments.push(item); return value; }), find: jest.fn(async ({ where }: any) => attachments.filter((item) => !where.reference || (where.reference._value ?? where.reference).includes?.(item.reference))), findOne: jest.fn(async ({ where }: any) => attachments.find((item) => (!where.reference || item.reference === where.reference) && (!where.careMessageId || item.careMessageId === where.careMessageId)) ?? null), remove: jest.fn(async row => { attachments = attachments.filter(item => item !== row); }) };
    manager = { transaction: jest.fn(async (work) => work(manager)), getRepository: jest.fn((entity) => entity === CareRequest ? careRepo : entity === CareConversation ? conversationRepo : entity === CareMessage ? messageRepo : entity === CareMessageAttachment ? attachmentRepo : entity === Provider ? providerRepo : entity === Patient ? patientRepo : entity === CareAppointment ? appointmentRepo : {}) };
    storage = { upload: jest.fn().mockResolvedValue({ publicId: 'smartclinic/care-chat/opaque', storageResourceType: 'raw', version: '1', format: 'pdf' }), delete: jest.fn(), createAccessUrl: jest.fn().mockResolvedValue('https://signed.example/private') };
    subject = new CareChatService({ manager } as any, patientRepo as any, { resolveOperational: jest.fn(async (user) => user.id === providerUser.id ? provider : { ...provider, id: 'old-provider' }) } as any, attachmentRepo as any, storage);
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
    expect(result.items[0]).toEqual({ reference: 'SC-MSG-ABCDEF123456', senderType: CareMessageSenderType.PROVIDER, body: '<script>alert(1)</script>', createdAt: expect.any(Date), readAt: null, attachments: [] });
  });

  it('marks only the other participant messages and reports authoritative unread counts', async () => {
    conversation = { id: 'conversation-id', reference: 'SC-CHAT-ABCDEF123456', careRequestId: care.id, patientId: patient.id, providerId: provider.id };
    await expect(subject.readPatient(patientUser, care.reference)).resolves.toEqual({ conversationReference: conversation.reference, markedRead: 2, unreadCount: 0 });
    expect(updateQb.andWhere).toHaveBeenCalledWith('sender_type = :other', { other: CareMessageSenderType.PROVIDER });
    expect(updateQb.andWhere).toHaveBeenCalledWith('read_at IS NULL');
  });

  it('uploads private PDF/image attachments only in writable chat and scopes pending ownership', async () => {
    const pdf: any = { originalname: '../report.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'), size: 8 };
    const pending: any = await subject.uploadPatient(patientUser, care.reference, pdf);
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'care-chat', resourceType: 'DOCUMENT' }));
    expect(pending).toMatchObject({ reference: expect.stringMatching(/^SC-CMA-/), originalName: 'report.pdf', expiresAt: expect.any(Date) });
    expect(attachments[0]).toMatchObject({ conversationId: 'conversation-id', uploadedByUserId: patientUser.id, careMessageId: null });
    care.status = CareRequestStatus.COMPLETED;
    await expect(subject.uploadProvider(providerUser, care.reference, { ...pdf, mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]), size: 3 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('atomically sends attachment-only and text-plus-attachment messages without exposing storage data', async () => {
    const pdf: any = { originalname: 'report.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'), size: 8 };
    const pending: any = await subject.uploadPatient(patientUser, care.reference, pdf);
    const sent: any = await subject.sendPatient(patientUser, care.reference, undefined, [pending.reference]);
    expect(sent.body).toBeNull(); expect(sent.attachments).toHaveLength(1); expect(sent.attachments[0]).not.toHaveProperty('storagePublicId');
    expect(attachments[0]).toMatchObject({ careMessageId: 'message-1', expiresAt: null });
    await expect(subject.sendPatient(patientUser, care.reference, 'again', [pending.reference])).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.sendPatient(patientUser, care.reference, '   ', [])).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects pending attachments from another sender/conversation and expired attachments', async () => {
    conversation = { id: 'conversation-id', reference: 'SC-CHAT-ABCDEF123456', careRequestId: care.id, patientId: patient.id, providerId: provider.id };
    const base = { id: 'attachment-1', reference: 'SC-CMA-ABCDEF123456', conversationId: conversation.id, uploadedByUserId: 'other-user', careMessageId: null, expiresAt: new Date(Date.now() + 10000), createdAt: new Date() };
    attachments.push(base);
    await expect(subject.sendPatient(patientUser, care.reference, 'file', [base.reference])).rejects.toThrow('does not belong');
    base.uploadedByUserId = patientUser.id; base.conversationId = 'other-conversation';
    await expect(subject.sendPatient(patientUser, care.reference, 'file', [base.reference])).rejects.toThrow('does not belong');
    base.conversationId = conversation.id; base.expiresAt = new Date(Date.now() - 1);
    await expect(subject.sendPatient(patientUser, care.reference, 'file', [base.reference])).rejects.toThrow('expired');
  });

  it('authorizes historical attachment access through current conversation ownership', async () => {
    conversation = { id: 'conversation-id', reference: 'SC-CHAT-ABCDEF123456', careRequestId: care.id, patientId: patient.id, providerId: provider.id };
    messages.push({ id: 'message-1', reference: 'SC-MSG-ABCDEF123456', conversationId: conversation.id });
    attachments.push({ id: 'attachment-1', reference: 'SC-CMA-ABCDEF123456', conversationId: conversation.id, careMessageId: 'message-1', storagePublicId: 'opaque', storageResourceType: 'raw', storageVersion: '1', storageFormat: 'pdf' });
    care.status = CareRequestStatus.COMPLETED;
    await expect(subject.accessPatient(patientUser, care.reference, 'SC-MSG-ABCDEF123456', 'SC-CMA-ABCDEF123456')).resolves.toEqual(expect.objectContaining({ url: 'https://signed.example/private' }));
    await expect(subject.accessProvider(providerUser, care.reference, 'SC-MSG-ABCDEF123456', 'SC-CMA-ABCDEF123456')).resolves.toEqual(expect.objectContaining({ url: 'https://signed.example/private' }));
  });

  it('keeps failed uploads/messages unbound and opportunistically removes expired pending objects', async () => {
    const pdf: any = { originalname: 'report.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'), size: 8 };
    storage.upload.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(subject.uploadPatient(patientUser, care.reference, pdf)).rejects.toThrow('storage unavailable');
    expect(attachments).toHaveLength(0);
    const pending: any = await subject.uploadPatient(patientUser, care.reference, pdf);
    manager.getRepository(CareMessage).save.mockRejectedValueOnce(new Error('message failed'));
    await expect(subject.sendPatient(patientUser, care.reference, undefined, [pending.reference])).rejects.toThrow('message failed');
    expect(attachments[0].careMessageId).toBeNull();
    attachments[0].expiresAt = new Date(Date.now() - 1);
    await subject.uploadPatient(patientUser, care.reference, pdf);
    expect(storage.delete).toHaveBeenCalledWith(expect.objectContaining({ publicId: 'smartclinic/care-chat/opaque' }));
  });

  it('rejects more than five or duplicate attachment references before persistence', async () => {
    await expect(subject.sendPatient(patientUser, care.reference, undefined, Array.from({ length: 6 }, (_, index) => `SC-CMA-ABCDEF12345${index}`))).rejects.toThrow('at most five');
    await expect(subject.sendPatient(patientUser, care.reference, undefined, ['SC-CMA-ABCDEF123456', 'SC-CMA-ABCDEF123456'])).rejects.toThrow('unique');
  });
});
