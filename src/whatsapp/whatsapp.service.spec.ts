import { PatientStatus } from '../patients/enums/patient-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { WhatsAppService } from './whatsapp.service';

const payload = (id = 'wamid.inbound', from = '0801 234 5678', type = 'text') => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id, from, type, timestamp: '1788600000' }] } }] }] });

describe('WhatsAppService', () => {
  let identityRows: any[]; let messageRows: any[]; let identities: any; let messages: any; let users: any; let patients: any; let provider: any; let service: WhatsAppService;
  beforeEach(() => {
    identityRows = []; messageRows = [];
    identities = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { const saved = { id: value.id ?? `identity-${identityRows.length + 1}`, ...value }; const i = identityRows.findIndex((row) => row.id === saved.id); if (i < 0) identityRows.push(saved); else identityRows[i] = saved; return saved; }),
      findOne: jest.fn(async ({ where }) => { const choices = Array.isArray(where) ? where : [where]; return identityRows.find((row) => choices.some((choice) => Object.entries(choice).every(([key, value]) => row[key] === value))) ?? null; }),
    };
    messages = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { const saved = { id: `message-${messageRows.length + 1}`, ...value }; messageRows.push(saved); return saved; }),
      findOne: jest.fn(async ({ where }) => messageRows.find((row) => row.provider === where.provider && row.providerMessageId === where.providerMessageId) ?? null),
    };
    users = { findOne: jest.fn().mockResolvedValue(null) };
    patients = { findOne: jest.fn().mockResolvedValue(null) };
    provider = { sendText: jest.fn().mockResolvedValue({ providerMessageId: 'wamid.outbound' }), verifyWebhookSignature: jest.fn().mockReturnValue(true) };
    service = new WhatsAppService(identities, messages, users, patients, { whatsapp: { webhookVerifyToken: 'verify-token', appSecret: undefined } } as never, provider);
  });

  it('normalizes a new sender, persists an unlinked identity, and sends the generic welcome without creating an account', async () => {
    await service.processWebhook(payload());
    expect(identityRows[0]).toMatchObject({ phoneNormalized: '+2348012345678', status: 'UNLINKED', userId: null, patientId: null });
    expect(users.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { phoneNormalized: '+2348012345678', status: UserStatus.ACTIVE } }));
    expect(provider.sendText).toHaveBeenCalledWith({ to: '+2348012345678', text: expect.stringContaining('Welcome to SmartClinic') });
    expect(provider.sendText.mock.calls[0][0].text).not.toMatch(/result|diagnos|passport|record/i);
    expect(identityRows).toHaveLength(1); expect(messageRows.filter((row) => row.direction === 'INBOUND')).toHaveLength(1);
  });

  it('links only an active USER patient and safely uses their given name', async () => {
    const patient = { id: 'patient-id', userId: 'user-id', givenName: 'Ada', status: PatientStatus.ACTIVE, deletedAt: null };
    users.findOne.mockResolvedValue({ id: 'user-id', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null, patient });
    await service.processWebhook(payload());
    expect(identityRows[0]).toMatchObject({ status: 'LINKED', userId: 'user-id', patientId: 'patient-id', linkedAt: expect.any(Date) });
    expect(provider.sendText).toHaveBeenCalledWith({ to: '+2348012345678', text: expect.stringContaining('Welcome back, Ada') });
  });

  it.each([[UserRole.PROVIDER], [UserRole.ADMIN], [UserRole.OPERATIONS]])('does not auto-link a non-patient %s-only account', async (role) => {
    users.findOne.mockResolvedValue({ id: 'staff-id', status: UserStatus.ACTIVE, roles: [role], deletedAt: null, patient: null });
    await service.processWebhook(payload());
    expect(identityRows[0].status).toBe('UNLINKED'); expect(provider.sendText.mock.calls[0][0].text).toContain('Welcome to SmartClinic');
  });

  it('deduplicates a retried provider message and reuses the existing identity', async () => {
    await service.processWebhook(payload()); const firstSeen = identityRows[0].firstSeenAt;
    await service.processWebhook(payload());
    expect(identityRows).toHaveLength(1); expect(identityRows[0].firstSeenAt).toBe(firstSeen);
    expect(messageRows.filter((row) => row.direction === 'INBOUND')).toHaveLength(1); expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid linked identity and updates lastSeenAt without a user phone search', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    identityRows.push({ id: 'identity-1', provider: 'META', providerUserId: '0801 234 5678', phoneNormalized: '+2348012345678', status: 'LINKED', userId: 'user-id', patientId: 'patient-id', firstSeenAt: old, lastSeenAt: old, linkedAt: old });
    patients.findOne.mockResolvedValue({ id: 'patient-id', userId: 'user-id', givenName: 'Ada', status: PatientStatus.ACTIVE, user: { id: 'user-id', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null } });
    await service.processWebhook(payload('wamid.second'));
    expect(identityRows[0].lastSeenAt.getTime()).toBeGreaterThan(old.getTime()); expect(users.findOne).not.toHaveBeenCalled();
  });

  it('ignores malformed and unsupported event structures without throwing', async () => {
    await expect(service.processWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: null, from: null }, { id: 'x', from: '123', type: 'image' }] } }] }] })).resolves.toBeUndefined();
    expect(identityRows).toHaveLength(0); expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('records outbound failure while retaining the processed inbound event', async () => {
    provider.sendText.mockRejectedValue(new Error('secret provider failure'));
    await expect(service.processWebhook(payload())).resolves.toBeUndefined();
    expect(messageRows).toEqual(expect.arrayContaining([expect.objectContaining({ direction: 'INBOUND', status: 'RECEIVED' }), expect.objectContaining({ direction: 'OUTBOUND', status: 'FAILED', providerMessageId: null })]));
  });
});
