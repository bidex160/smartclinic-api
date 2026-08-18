import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

export class AdminUserSearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 100 }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(100) q!: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class AdminUserProviderLinkDto { @ApiProperty({ format: 'uuid' }) providerId!: string; @ApiProperty() providerDisplayName!: string; }
export class AdminUserSearchItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ enum: UserRole, isArray: true }) roles!: UserRole[];
  @ApiPropertyOptional({ type: AdminUserProviderLinkDto, nullable: true }) providerLink!: AdminUserProviderLinkDto | null;
}
export class AdminUserSearchResponseDto {
  @ApiProperty({ type: AdminUserSearchItemDto, isArray: true }) items!: AdminUserSearchItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
