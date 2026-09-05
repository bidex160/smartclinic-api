import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailSendOutcome } from '../notifications/email/email-provider';
import { ProviderRecruitmentInvitationSource } from './enums/provider-recruitment-invitation.enum';
import { ProviderRecruitmentInvitationsService } from './provider-recruitment-invitations.service';

describe('ProviderRecruitmentInvitationsService', () => {
  const user = { id: 'patient-user-id' } as any;
  const base = {
    organisationName: 'Eket General Hospital', email: 'contact@example.com',
    source: ProviderRecruitmentInvitationSource.HEALTH_CHECK_NO_PROVIDER,
    packageCode: 'COMPLETE', fulfilmentModeCode: 'PROVIDER_LOCATION',
    preferredDate: '2026-09-04', preferredTime: '21:37', countryCode: 'NG', stateOrRegion: 'Akwa Ibom', city: 'Eket',
  };
  let rows: any[];
  let invitations: any;
  let packages: any;
  let fulfilmentModes: any;
  let emailProvider: any;
  let service: ProviderRecruitmentInvitationsService;

  beforeEach(() => {
    rows = [];
    invitations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const saved = { id: value.id ?? 'invitation-id', createdAt: value.createdAt ?? new Date('2026-09-04T20:00:00Z'), updatedAt: new Date(), ...value };
        const index = rows.findIndex((row) => row.id === saved.id);
        if (index >= 0) rows[index] = saved; else rows.push(saved);
        return saved;
      }),
      findOne: jest.fn(async ({ where }) => rows.find((row) => row.submissionKey === where.submissionKey) ?? null),
    };
    packages = { findOne: jest.fn().mockResolvedValue({ id: 'package-id', code: 'COMPLETE', isActive: true }) };
    fulfilmentModes = { findOne: jest.fn().mockResolvedValue({ id: 'mode-id', code: 'PROVIDER_LOCATION', isActive: true }) };
    emailProvider = { sendTransactionalEmail: jest.fn().mockResolvedValue({ outcome: EmailSendOutcome.SENT }) };
    service = new ProviderRecruitmentInvitationsService(invitations, packages, fulfilmentModes, {
      frontendUrl: 'https://app.example.test', email: { fromAddress: 'hello@example.test', fromName: 'SmartClinic' },
    } as never, emailProvider);
  });

  it('persists authoritative Health Check context and sends a public registration invitation without patient details', async () => {
    const result = await service.create(user, base);
    expect(packages.findOne).toHaveBeenCalledWith({ where: { code: 'COMPLETE', isActive: true } });
    expect(fulfilmentModes.findOne).toHaveBeenCalledWith({ where: { code: 'PROVIDER_LOCATION', isActive: true } });
    expect(rows[0]).toMatchObject({ invitedByUserId: user.id, status: 'PENDING', packageCode: 'COMPLETE', fulfilmentModeCode: 'PROVIDER_LOCATION', emailNotificationStatus: 'SENT', providerId: null });
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'contact@example.com', idempotencyKey: expect.stringContaining('provider-recruitment-invitation:'), html: expect.stringContaining('https://app.example.test/provider/register') }));
    const message = emailProvider.sendTransactionalEmail.mock.calls[0][0];
    expect(`${message.html}${message.text}`).not.toContain(user.id);
    expect(result).toEqual(expect.objectContaining({ reference: expect.stringMatching(/^SCPI-[A-F0-9]{12}$/), context: expect.objectContaining({ city: 'Eket' }) }));
    expect(result).not.toHaveProperty('id'); expect(result).not.toHaveProperty('invitedByUserId'); expect(result).not.toHaveProperty('emailNotificationFailureReason');
  });

  it('accepts email-only contact', async () => {
    await expect(service.create(user, { ...base, phone: undefined })).resolves.toMatchObject({ email: 'contact@example.com', phone: null });
  });

  it('accepts phone-only contact without attempting email or SMS', async () => {
    const result = await service.create(user, { ...base, email: undefined, phone: '+234 801 234 5678' });
    expect(result).toMatchObject({ email: null, phone: '+234 801 234 5678' });
    expect(rows[0].emailNotificationStatus).toBe('NOT_APPLICABLE');
    expect(emailProvider.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('rejects when neither email nor phone is supplied', async () => {
    await expect(service.create(user, { ...base, email: undefined, phone: undefined })).rejects.toBeInstanceOf(BadRequestException);
    expect(invitations.save).not.toHaveBeenCalled();
  });

  it.each(['package', 'fulfilment mode'])('rejects missing/inactive authoritative %s context', async (label) => {
    if (label === 'package') packages.findOne.mockResolvedValueOnce(null);
    else fulfilmentModes.findOne.mockResolvedValueOnce(null);
    await expect(service.create(user, base)).rejects.toBeInstanceOf(NotFoundException);
    expect(invitations.save).not.toHaveBeenCalled();
  });

  it.each([
    ['unavailable outcome', async () => ({ outcome: EmailSendOutcome.UNAVAILABLE })],
    ['thrown provider error', async () => { throw new Error('secret provider detail'); }],
  ])('keeps the persisted invitation and records a safe failure for %s', async (_label, implementation) => {
    emailProvider.sendTransactionalEmail.mockImplementationOnce(implementation);
    await expect(service.create(user, base)).resolves.toMatchObject({ status: 'PENDING' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ emailNotificationStatus: 'FAILED' });
    expect(rows[0].emailNotificationFailureReason).not.toContain('secret provider detail');
  });

  it('has no booking, quote, assignment, reservation, or provider creation dependency', () => {
    expect(Object.keys(service)).toEqual(expect.arrayContaining(['invitations', 'packages', 'fulfilmentModes', 'emailProvider']));
    expect(Object.keys(service)).not.toEqual(expect.arrayContaining(['bookings', 'quotes', 'assignments', 'reservations', 'providers']));
  });
});
