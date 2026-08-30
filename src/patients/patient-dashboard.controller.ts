import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { PatientDashboardDto } from './dto/patient-dashboard.dto';
import { PatientDashboardService } from './patient-dashboard.service';

@ApiTags('My dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@Controller('me/dashboard')
export class MePatientDashboardController {
  constructor(private readonly dashboard: PatientDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated Patient dashboard read model' })
  @ApiOkResponse({ type: PatientDashboardDto })
  @ApiNotFoundResponse()
  get(@Req() request: { user: User }): Promise<PatientDashboardDto> {
    return this.dashboard.get(request.user);
  }
}
