import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { RegisterPushDeviceDto, UnregisterPushDeviceDto } from '../dto/register-push-device.dto';
import { PushDevicesService } from './push-devices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/push-devices')
export class PushDevicesController {
  constructor(private readonly devices: PushDevicesService) {}

  @Post()
  register(@Req() req: { user: { id: string } }, @Body() dto: RegisterPushDeviceDto) {
    return this.devices.register(req.user.id, dto);
  }

  @Delete()
  unregister(@Req() req: { user: { id: string } }, @Body() dto: UnregisterPushDeviceDto) {
    return this.devices.unregister(req.user.id, dto.token);
  }
}
