import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProviderStatus } from '../enums/provider-status.enum';

export class CreateAdminProviderDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(200) displayName!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsOptional() @IsString() @MaxLength(200) professionalReference?: string | null;
}
export class UpdateAdminProviderDto extends PartialType(CreateAdminProviderDto) {}
export class LinkProviderUserDto { @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string; }
export class AdminProviderListQueryDto {
  @ApiPropertyOptional({ enum: ProviderStatus }) @IsOptional() @IsEnum(ProviderStatus) status?: ProviderStatus;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() linkedUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class AdminLinkedUserResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiProperty({ enum: UserRole, isArray: true }) roles!: UserRole[];
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
}
export class AdminProviderListItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ nullable: true }) professionalReference!: string | null;
  @ApiProperty({ enum: ProviderStatus }) status!: ProviderStatus;
  @ApiPropertyOptional({ type: AdminLinkedUserResponseDto, nullable: true }) linkedUser!: AdminLinkedUserResponseDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
export class AdminProviderDetailResponseDto extends AdminProviderListItemResponseDto {
  @ApiProperty() capabilityCount!: number;
  @ApiProperty() locationCount!: number;
}
export class AdminProviderListResponseDto {
  @ApiProperty({ type: AdminProviderListItemResponseDto, isArray: true }) items!: AdminProviderListItemResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
