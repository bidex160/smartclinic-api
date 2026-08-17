import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
export class ProviderIdParamsDto { @ApiProperty({ format: 'uuid' }) @IsUUID() providerId!: string; }
export class ResourceIdParamsDto { @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string; }
export class ServiceLocationParamsDto extends ResourceIdParamsDto { @ApiProperty({ format: 'uuid' }) @IsUUID() locationId!: string; }
