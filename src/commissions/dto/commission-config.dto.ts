import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { CommissionRateSource } from '../enums/commission-rate-source.enum';

export class SetCommissionRateDto {
  @ApiProperty({ description: 'Commission rate in basis points; 1000 = 10%, 750 = 7.5%', minimum: 0, maximum: 10000 })
  @IsInt() @Min(0) @Max(10000) commissionBasisPoints!: number;
}

export class PlatformCommissionResponseDto {
  @ApiProperty() configured!: boolean;
  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 10000 }) commissionBasisPoints!: number | null;
  @ApiPropertyOptional({ nullable: true, example: '10.00' }) commissionPercentage!: string | null;
  @ApiPropertyOptional({ nullable: true }) updatedAt!: Date | null;
}

export class ProviderCommissionResponseDto {
  @ApiProperty() providerReference!: string;
  @ApiPropertyOptional({ nullable: true }) platformDefaultBasisPoints!: number | null;
  @ApiPropertyOptional({ nullable: true }) providerOverrideBasisPoints!: number | null;
  @ApiProperty() configured!: boolean;
  @ApiPropertyOptional({ nullable: true }) effectiveBasisPoints!: number | null;
  @ApiPropertyOptional({ nullable: true, enum: CommissionRateSource }) source!: CommissionRateSource | null;
}
