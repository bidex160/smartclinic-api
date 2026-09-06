import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto, ResetPasswordDto } from './password-reset.dto';

describe('password reset DTOs', () => {
  it('normalizes and validates forgot-password email', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: ' ADA@Example.COM ' });
    expect(dto.email).toBe('ada@example.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('reuses the registration password bounds for reset passwords', async () => {
    expect(await validate(plainToInstance(ResetPasswordDto, { token: 'x'.repeat(32), password: 'short' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ResetPasswordDto, { token: 'x'.repeat(32), password: 'new-password' }))).toHaveLength(0);
  });
});
