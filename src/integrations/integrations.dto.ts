import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Hospital EMR' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class ApiKeyIdParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

export class SetWebhookDto {
  @ApiProperty({ example: 'https://emr.yourhospital.ng/smartclinic/webhooks' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ description: 'Create a new signing secret (the old one stops working)' })
  @IsOptional()
  @IsBoolean()
  rotateSecret?: boolean;
}
