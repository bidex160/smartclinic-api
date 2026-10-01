import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { PushDevicePlatform } from '../enums/push-device-platform.enum';

export class RegisterPushDeviceDto {
  // Browsers register through /me/web-push so their subscriptions are validated.
  @IsIn([PushDevicePlatform.ANDROID, PushDevicePlatform.IOS])
  platform!: PushDevicePlatform.ANDROID | PushDevicePlatform.IOS;

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
