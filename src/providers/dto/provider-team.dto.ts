import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { ProviderMemberRole } from '../enums/provider-member.enum';

export class InviteProviderMemberDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail() @MaxLength(254) email!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(120) displayName?: string | null;
  @ApiProperty({ enum: ProviderMemberRole }) @IsEnum(ProviderMemberRole) role!: ProviderMemberRole;
}

export class UpdateProviderMemberDto {
  @ApiProperty({ enum: ProviderMemberRole }) @IsEnum(ProviderMemberRole) role!: ProviderMemberRole;
}

export class ProviderMemberIdParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

export class TeamInvitationTokenParamsDto {
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
