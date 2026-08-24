import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { PatientPortalProfileDto } from './dto/patient-portal-profile.dto';
import { PatientPortalProfileService } from './patient-portal-profile.service';

@ApiTags('My patient profile') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me/profile')
export class MePatientProfileController {
  constructor(private readonly profile: PatientPortalProfileService) {}
  @Get() @ApiOperation({ summary: 'Get the authenticated USER and their SELF Patient identity' }) @ApiOkResponse({ type: PatientPortalProfileDto }) @ApiNotFoundResponse()
  get(@Req() request: { user: User }) { return this.profile.get(request.user); }
}
