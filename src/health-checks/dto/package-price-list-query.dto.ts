import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PackagePriceListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() healthCheckPackageId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() fulfilmentModeId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() isActive?: boolean;
}
