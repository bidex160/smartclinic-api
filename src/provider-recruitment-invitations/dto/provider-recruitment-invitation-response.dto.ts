import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderRecruitmentInvitationSource, ProviderRecruitmentInvitationStatus } from '../enums/provider-recruitment-invitation.enum';

export class ProviderRecruitmentInvitationContextDto {
  @ApiPropertyOptional({ nullable: true }) packageCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) serviceCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) fulfilmentModeCode!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date' }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTime!: string | null;
  @ApiPropertyOptional({ nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) stateOrRegion!: string | null;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
}

export class ProviderRecruitmentInvitationResponseDto {
  @ApiProperty() reference!: string;
  @ApiProperty() organisationName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty({ enum: ProviderRecruitmentInvitationSource }) source!: ProviderRecruitmentInvitationSource;
  @ApiProperty({ enum: ProviderRecruitmentInvitationStatus }) status!: ProviderRecruitmentInvitationStatus;
  @ApiProperty({ type: ProviderRecruitmentInvitationContextDto }) context!: ProviderRecruitmentInvitationContextDto;
  @ApiProperty() createdAt!: Date;
}
