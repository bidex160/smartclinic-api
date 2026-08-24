import { Transform } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class BookingVisitAddressDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 255) addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(255) addressLine2?: string | null;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 120) city!: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 120) stateOrRegion!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(30) postalCode?: string | null;
  @ApiProperty({ example: 'NG' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsLatitude() latitude?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsLongitude() longitude?: number | null;
}
