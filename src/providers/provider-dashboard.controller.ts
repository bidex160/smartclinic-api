import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ProviderDashboardSummaryDto } from './dto/provider-dashboard-summary.dto';
import { ProviderDashboardService } from './provider-dashboard.service';

@ApiTags('Provider dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@Controller('provider/dashboard')
export class ProviderDashboardController {
  constructor(private readonly dashboard: ProviderDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get count-only operational dashboard metrics for the authenticated active Provider' })
  @ApiOkResponse({ type: ProviderDashboardSummaryDto })
  summary(@Req() request: { user: User }) {
    return this.dashboard.summary(request.user);
  }
}
