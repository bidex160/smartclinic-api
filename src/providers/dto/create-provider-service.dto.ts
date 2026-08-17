import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
export class CreateProviderServiceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() healthCheckPackageId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() fulfilmentModeId!: string;
}
