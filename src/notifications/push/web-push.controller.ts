import { BadRequestException, Body, Controller, Delete, Get, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { WebPushSubscriptionDto, WebPushUnsubscribeDto } from '../dto/web-push-subscription.dto';
import { PushDevicePlatform } from '../enums/push-device-platform.enum';
import { PushDevicesService } from './push-devices.service';
import { isAllowedPushEndpoint, WebPushProvider, webPushToken } from './web-push.provider';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/web-push')
export class WebPushController {
  constructor(private readonly devices: PushDevicesService, private readonly webPush: WebPushProvider) {}

  @Get('config')
  config(): { enabled: boolean; publicKey: string | null } {
    return { enabled: this.webPush.enabled, publicKey: this.webPush.publicKey };
  }

  @Post('subscriptions')
  subscribe(@Req() req: { user: { id: string } }, @Body() dto: WebPushSubscriptionDto) {
    if (!this.webPush.enabled) throw new ServiceUnavailableException('Browser notifications are not available yet.');
    if (!isAllowedPushEndpoint(dto.endpoint)) throw new BadRequestException('This browser’s push service is not supported.');
    return this.devices.register(req.user.id, { platform: PushDevicePlatform.WEB, token: webPushToken(dto) });
  }

  @Delete('subscriptions')
  unsubscribe(@Req() req: { user: { id: string } }, @Body() dto: WebPushUnsubscribeDto) {
    return this.devices.unregisterWebEndpoint(req.user.id, dto.endpoint);
  }
}
