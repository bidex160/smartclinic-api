import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ProviderInvitationStatus } from '../enums/provider-invitation-status.enum';

export class CreateProviderInvitationDto { @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(254) email!: string; }
export class AcceptProviderInvitationDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(120) displayName!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, format: 'password' }) @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class ProviderInvitationTokenParamsDto { @ApiProperty() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string; }
export class ProviderInvitationProviderSummaryDto { @ApiProperty() displayName!: string; }
export class ProviderInvitationCreatorSummaryDto { @ApiProperty({ format: 'uuid' }) id!: string; @ApiPropertyOptional({ nullable: true }) email!: string | null; @ApiPropertyOptional({ nullable: true }) displayName!: string | null; }
export class AdminProviderInvitationSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ProviderInvitationProviderSummaryDto }) provider!: ProviderInvitationProviderSummaryDto;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ProviderInvitationStatus }) status!: ProviderInvitationStatus;
  @ApiProperty() expiresAt!: Date;
  @ApiPropertyOptional({ nullable: true }) acceptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: ProviderInvitationCreatorSummaryDto, nullable: true }) createdBy!: ProviderInvitationCreatorSummaryDto | null;
}
export enum ProviderInvitationDeliveryStatus { SENT = 'SENT', MANUAL_REQUIRED = 'MANUAL_REQUIRED', FAILED = 'FAILED' }
export class CreatedProviderInvitationResponseDto extends AdminProviderInvitationSummaryDto {
  @ApiProperty({ enum: ProviderInvitationDeliveryStatus }) deliveryStatus!: ProviderInvitationDeliveryStatus;
  @ApiPropertyOptional({ description: 'Returned once only when manual delivery is required.', nullable: true }) manualInvitationLink?: string;
}
export class PublicProviderInvitationResponseDto { @ApiProperty() providerDisplayName!: string; @ApiProperty() invitedEmail!: string; @ApiProperty() expiresAt!: Date; }
export class AcceptedProviderInvitationResponseDto { @ApiProperty() providerDisplayName!: string; @ApiProperty() email!: string; @ApiProperty({ enum: ProviderInvitationStatus }) status!: ProviderInvitationStatus.ACCEPTED; @ApiProperty({ default: true }) loginRequired!: true; }
