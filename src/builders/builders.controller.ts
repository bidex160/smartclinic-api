import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { BuildersService } from './builders.service';
import { BuilderDashboardDto } from './dto/builder-dashboard.dto';

@ApiTags('Builder dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.PROVIDER)
@Controller('me/builder')
export class BuildersController {
  constructor(private readonly builders: BuildersService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get the authenticated Builder dashboard' })
  @ApiOkResponse({ type: BuilderDashboardDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Builder or Ambassador network access is required.' })
  dashboard(@Req() request: { user: User }): Promise<BuilderDashboardDto> {
    return this.builders.dashboard(request.user);
  }
}
