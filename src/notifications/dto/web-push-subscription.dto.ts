import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class WebPushSubscriptionKeysDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  auth!: string;
}

export class WebPushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint!: string;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;
}

export class WebPushUnsubscribeDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint!: string;
}
