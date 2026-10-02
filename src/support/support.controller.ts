import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateSupportCallbackDto, SupportCallbackListQueryDto, UpdateSupportCallbackDto } from './support.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@Controller('public/support')
export class PublicSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('contact')
  @ApiOperation({ summary: 'Phone and WhatsApp numbers for help, by country' })
  contact() {
    return this.support.contacts();
  }

  @Post('callback-requests')
  @ApiOperation({ summary: 'Ask SmartClinic to phone you back. No account needed.' })
  callback(@Body() dto: CreateSupportCallbackDto, @Req() req: Request & { user?: User }) {
    return this.support.requestCallback(dto, req.user ?? null);
  }
}

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/support/callback-requests')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@Query() q: SupportCallbackListQueryDto) {
    return this.support.list(q);
  }

  @Patch(':reference')
  update(@Param('reference') reference: string, @Body() dto: UpdateSupportCallbackDto, @Req() req: { user: User }) {
    return this.support.update(reference, dto, req.user);
  }
}
