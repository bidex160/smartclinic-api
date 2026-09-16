import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { PushDevicePlatform } from '../enums/push-device-platform.enum';

export class RegisterPushDeviceDto {
  @IsEnum(PushDevicePlatform)
  platform!: PushDevicePlatform;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsUUID()
  installationId?: string;
}

export class UnregisterPushDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token!: string;
}
