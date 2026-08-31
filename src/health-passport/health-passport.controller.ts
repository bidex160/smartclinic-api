import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { HealthPassportTimelineQueryDto } from './dto/health-passport-query.dto';
import { HealthPassportService } from './health-passport.service';

@ApiTags('My Health Passport')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/health-passport')
export class HealthPassportController {
  constructor(private readonly passport: HealthPassportService) {}

  @Get()
  overview(@Req() request: { user: User }) {
    return this.passport.overview(request.user.id);
  }

  @Get('timeline')
  timeline(
    @Req() request: { user: User },
    @Query() query: HealthPassportTimelineQueryDto,
  ) {
    return this.passport.timeline(request.user.id, query);
  }
}
