import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from "class-validator";
import { UserStatus } from "../../users/enums/user-status.enum";
import { UserRole } from "../../users/enums/user-role.enum";
import { ProviderStatus } from "../enums/provider-status.enum";
import { ProviderOnboardingStatus } from "../enums/provider-onboarding-status.enum";
import { ProviderType } from "../enums/provider-type.enum";
import { CreatedProviderInvitationResponseDto } from "./provider-invitation.dto";

export class CreateAdminProviderDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  professionalReference?: string | null;
  @ApiProperty({ enum: ProviderType }) @IsEnum(ProviderType) providerType!: ProviderType;
  @ApiProperty({ example: "NG" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  stateOrRegion!: string;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;
}
export class UpdateAdminProviderDto extends PartialType(OmitType(CreateAdminProviderDto, ["email"] as const)) {}
export class LinkProviderUserDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() userId!: string;
}
export class AdminProviderListQueryDto {
  @ApiPropertyOptional({ enum: ProviderStatus })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;
  @ApiPropertyOptional({ enum: ProviderOnboardingStatus })
  @IsOptional()
  @IsEnum(ProviderOnboardingStatus)
  onboardingStatus?: ProviderOnboardingStatus;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  linkedUserId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
export class AdminLinkedUserResponseDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiProperty({ enum: UserRole, isArray: true }) roles!: UserRole[];
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
}
export class AdminProviderListItemResponseDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) professionalReference!:
    | string
    | null;
  @ApiProperty({ enum: ProviderStatus }) status!: ProviderStatus;
  @ApiProperty({ enum: ProviderType }) providerType!: ProviderType;
  @ApiPropertyOptional({ nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) stateOrRegion!: string | null;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiProperty({ enum: ProviderOnboardingStatus }) onboardingStatus!: ProviderOnboardingStatus;
  @ApiPropertyOptional({ nullable: true }) submittedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) reviewedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) reviewNote!: string | null;
  @ApiPropertyOptional({ type: AdminLinkedUserResponseDto, nullable: true })
  linkedUser!: AdminLinkedUserResponseDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
export class AdminProviderDetailResponseDto extends AdminProviderListItemResponseDto {
  @ApiProperty() capabilityCount!: number;
  @ApiProperty() locationCount!: number;
}
export class AdminProviderListResponseDto {
  @ApiProperty({ type: AdminProviderListItemResponseDto, isArray: true })
  items!: AdminProviderListItemResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
export class AdminCreatedProviderResponseDto {
  @ApiProperty({ type: AdminProviderDetailResponseDto }) provider!: AdminProviderDetailResponseDto;
  @ApiProperty({ type: CreatedProviderInvitationResponseDto }) invitation!: CreatedProviderInvitationResponseDto;
}

export class RejectProviderDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string | null;
}
