import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength, Validate, ValidateIf, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { isEmail } from 'class-validator';
import { normalizePhoneNumber } from '../../users/phone-normalization';

@ValidatorConstraint({ name: 'loginIdentifier', async: false })
class LoginIdentifierConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    return isEmail(normalized) || normalizePhoneNumber(normalized) !== null;
  }

  defaultMessage(): string {
    return 'identifier must be a valid email address or phone number';
  }
}

export class LoginDto {
  @ApiPropertyOptional({ example: 'ada@example.com', description: 'Email address or supported phone number' })
  @ValidateIf((dto: LoginDto) => dto.identifier !== undefined || dto.email === undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @Validate(LoginIdentifierConstraint)
  identifier?: string;

  @ApiPropertyOptional({ example: 'ada@example.com', deprecated: true, description: 'Legacy email login field' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  email?: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
