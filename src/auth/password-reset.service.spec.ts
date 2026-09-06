import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { UserStatus } from '../users/enums/user-status.enum';

describe('PasswordResetService', () => {
  const email = 'ada@example.com';
  const user: any = { id: 'user-1', emailNormalized: email, email, status: UserStatus.ACTIVE, deletedAt: null, credential: { id: 'credential-1', userId: 'user-1', passwordHash: '' } };
  let users: any; let credentials: any; let sessions: any; let tokens: any; let emailProvider: any; let manager: any; let subject: PasswordResetService;

  beforeEach(() => {
    user.credential.passwordHash = '';
    const tokenRows: any[] = [];
    const tokenRepo: any = { create: jest.fn((value) => ({ id: `token-${tokenRows.length + 1}`, createdAt: new Date(), ...value })), save: jest.fn(async (value) => { tokenRows.push(value); return value; }), update: jest.fn(async () => undefined), findOne: jest.fn(async ({ where }: any) => tokenRows.find((row) => row.tokenHash === where.tokenHash) ?? null), createQueryBuilder: jest.fn(() => ({ update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn(async () => ({ affected: 0 })) })) };
    manager = { getRepository: jest.fn((entity) => entity.name === 'PasswordResetToken' ? tokenRepo : entity.name === 'User' ? users : entity.name === 'UserCredential' ? credentials : sessions) };
    tokenRepo.manager = { transaction: jest.fn(async (work) => work(manager)) };
    tokens = tokenRepo;
    users = { findOne: jest.fn().mockResolvedValue(user) };
    credentials = { save: jest.fn(async (value) => value) };
    sessions = { createQueryBuilder: jest.fn(() => ({ update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn(async () => ({ affected: 1 })) })) };
    emailProvider = { sendTransactionalEmail: jest.fn().mockResolvedValue({ outcome: 'SENT' }) };
    subject = new PasswordResetService(users, credentials, sessions, tokens, { frontendUrl: 'https://app.example.test', auth: { passwordResetTokenTtlMinutes: 30 }, email: { fromAddress: 'no-reply@example.test', fromName: 'SmartClinic' } } as never, emailProvider);
  });

  it('returns a generic response and sends a hashed-token reset email', async () => {
    const result = await subject.forgotPassword({ email: ' ADA@Example.COM ' });
    expect(result.message).toContain('If an account exists');
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: email, idempotencyKey: expect.stringContaining('PASSWORD-RESET') }));
    const message = emailProvider.sendTransactionalEmail.mock.calls[0][0];
    const raw = new URL(message.text.match(/https:\/\/[^\s]+/)?.[0] ?? '').searchParams.get('token');
    expect(raw).toBeTruthy();
    expect(tokens.save).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: expect.not.stringMatching(raw!) }));
    expect(JSON.stringify(tokens.save.mock.calls[0][0])).not.toContain(raw);
  });

  it('does not enumerate unknown or credential-less accounts', async () => {
    users.findOne.mockResolvedValueOnce(null);
    await expect(subject.forgotPassword({ email })).resolves.toEqual({ message: expect.stringContaining('If an account exists') });
    expect(emailProvider.sendTransactionalEmail).not.toHaveBeenCalled();
    users.findOne.mockResolvedValueOnce({ ...user, credential: null });
    await expect(subject.forgotPassword({ email })).resolves.toEqual({ message: expect.stringContaining('If an account exists') });
  });

  it('resets once and revokes sessions', async () => {
    const token = await subject.forgotPassword({ email });
    const raw = new URL(emailProvider.sendTransactionalEmail.mock.calls[0][0].text.match(/https:\/\/[^\s]+/)?.[0] ?? '').searchParams.get('token')!;
    tokens.findOne.mockResolvedValue({ id: 'token-1', userId: user.id, tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), usedAt: null });
    users.findOne.mockResolvedValue({ ...user, credential: { ...user.credential, passwordHash: await bcrypt.hash('old-password', 4) } });
    await expect(subject.resetPassword({ token: raw, password: 'new-password' })).resolves.toMatchObject({ message: expect.stringContaining('successfully') });
    expect(credentials.save).toHaveBeenCalled();
    expect(sessions.createQueryBuilder).toHaveBeenCalled();
  });

  it('rejects invalid tokens safely', async () => {
    tokens.findOne.mockResolvedValue(null);
    await expect(subject.resetPassword({ token: 'x'.repeat(32), password: 'new-password' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    { usedAt: null, expiresAt: new Date(Date.now() - 1) },
  ])('rejects used or expired tokens without changing credentials', async (state) => {
    tokens.findOne.mockResolvedValue({ id: 'token-1', userId: user.id, tokenHash: 'hash', ...state });
    await expect(subject.resetPassword({ token: 'x'.repeat(32), password: 'new-password' })).rejects.toBeInstanceOf(BadRequestException);
    expect(credentials.save).not.toHaveBeenCalled();
  });
});
