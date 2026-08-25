import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardSummaryDto } from './dto/admin-dashboard-summary.dto';

@ApiTags('Admin dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get count-only platform operational dashboard metrics' })
  @ApiOkResponse({ type: AdminDashboardSummaryDto })
  summary() {
    return this.dashboard.summary();
  }
}
