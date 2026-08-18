import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { HealthResultAccessGrantStatus } from '../enums/health-result-access-grant-status.enum';

export class HealthResultAccessTokenParamsDto { @ApiProperty() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string; }
export class HealthResultAccessGrantResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: HealthResultAccessGrantStatus }) status!: HealthResultAccessGrantStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) revokedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
export class IssuedHealthResultAccessGrantResponseDto extends HealthResultAccessGrantResponseDto {
  @ApiProperty({ description: 'Opaque guest-result token returned once for manual delivery.' }) resultAccessToken!: string;
}
