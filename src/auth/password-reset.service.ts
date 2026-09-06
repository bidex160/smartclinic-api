import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { appConfig } from '../config/app.config';
import { EMAIL_PROVIDER, EmailProvider, EmailSendOutcome } from '../notifications/email/email-provider';
import { User } from '../users/entities/user.entity';
import { UserCredential } from '../users/entities/user-credential.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { AuthSession } from './entities/auth-session.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { hashPassword } from './password-hashing';

const GENERIC_FORGOT_RESPONSE = { message: 'If an account exists for that email, password reset instructions have been sent.' };
const RESET_ERROR = 'This password reset link is invalid or has expired.';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserCredential) private readonly credentials: Repository<UserCredential>,
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
    @InjectRepository(PasswordResetToken) private readonly tokens: Repository<PasswordResetToken>,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { emailNormalized: email }, relations: { credential: true }, withDeleted: true });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE || !user.credential || !user.emailNormalized) return GENERIC_FORGOT_RESPONSE;

    const rawToken = randomBytes(32).toString('base64url');
    const token = await this.tokens.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PasswordResetToken);
      await repository.createQueryBuilder().update(PasswordResetToken).set({ usedAt: new Date() }).where('user_id = :userId AND used_at IS NULL', { userId: user.id }).execute();
      return repository.save(repository.create({ userId: user.id, tokenHash: this.hash(rawToken), expiresAt: new Date(Date.now() + this.config.auth.passwordResetTokenTtlMinutes * 60_000), usedAt: null }));
    });

    try {
      const resetUrl = `${this.config.frontendUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
      const result = await this.emailProvider.sendTransactionalEmail({
        to: user.emailNormalized,
        fromAddress: this.config.email.fromAddress,
        fromName: this.config.email.fromName,
        subject: 'Reset your SmartClinic password',
        text: `Reset your SmartClinic password using this link: ${resetUrl}\n\nThis link expires in ${this.config.auth.passwordResetTokenTtlMinutes} minutes. If you did not request this, you can ignore this email.`,
        html: `<p>We received a request to reset your SmartClinic password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in ${this.config.auth.passwordResetTokenTtlMinutes} minutes. If you did not request this, you can ignore this email.</p>`,
        idempotencyKey: `PASSWORD-RESET-${token.id}`,
      });
      if (result.outcome !== EmailSendOutcome.SENT) throw new Error('Email provider unavailable');
    } catch (error) {
      await this.tokens.update({ id: token.id }, { usedAt: new Date() }).catch(() => undefined);
      this.logger.warn('Password reset email delivery failed');
    }
    return GENERIC_FORGOT_RESPONSE;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hash(dto.token);
    await this.tokens.manager.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(PasswordResetToken);
      const token = await tokenRepository.findOne({ where: { tokenHash }, lock: { mode: 'pessimistic_write' } });
      if (!token || token.usedAt || token.expiresAt <= new Date()) throw new BadRequestException(RESET_ERROR);
      const user = await manager.getRepository(User).findOne({ where: { id: token.userId }, relations: { credential: true }, withDeleted: true });
      if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE || !user.credential) throw new BadRequestException(RESET_ERROR);
      const passwordHash = await hashPassword(dto.password);
      user.credential.passwordHash = passwordHash;
      await manager.getRepository(UserCredential).save(user.credential);
      token.usedAt = new Date();
      await tokenRepository.save(token);
      await tokenRepository.createQueryBuilder().update(PasswordResetToken).set({ usedAt: new Date() }).where('user_id = :userId AND id <> :id AND used_at IS NULL', { userId: user.id, id: token.id }).execute();
      await manager.getRepository(AuthSession).createQueryBuilder().update(AuthSession).set({ revokedAt: new Date() }).where('user_id = :userId AND revoked_at IS NULL', { userId: user.id }).execute();
    });
    return { message: 'Your password has been reset successfully.' };
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
