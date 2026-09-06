import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Opaque password reset token from the email link' })
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 6, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
