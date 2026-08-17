import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO31661Alpha2, IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateProviderLocationDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(255) addressLine2?: string | null;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) city!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) state!: string;
  @ApiProperty({ example: 'NG' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsISO31661Alpha2() countryCode!: string;
  @ApiPropertyOptional({ minimum: -90, maximum: 90, nullable: true }) @IsOptional() @Type(() => Number) @IsNumber() @IsLatitude() latitude?: number | null;
  @ApiPropertyOptional({ minimum: -180, maximum: 180, nullable: true }) @IsOptional() @Type(() => Number) @IsNumber() @IsLongitude() longitude?: number | null;
}
