import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ManualProviderAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  providerId!: string;
}

export class OverrideProviderAssignmentDto extends ManualProviderAssignmentDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class ReassignProviderDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'When omitted, sequential eligibility discovery chooses the next provider.' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
