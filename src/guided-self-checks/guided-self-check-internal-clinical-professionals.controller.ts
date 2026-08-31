import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthorizeInternalClinicalProfessionalDto, ChangeInternalClinicalCapabilityDto, InternalClinicalProfessionalListQueryDto } from './dto/guided-self-check-internal-clinical-professional.dto';
import { GuidedSelfCheckInternalClinicalProfessionalsService } from './guided-self-check-internal-clinical-professionals.service';

@ApiTags('Guided Self-Check internal clinical professional directory')
@ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/guided-self-check-clinical-professionals')
export class GuidedSelfCheckInternalClinicalProfessionalDirectoryController {
  constructor(private professionals: GuidedSelfCheckInternalClinicalProfessionalsService) {}
  @Get() list(@Query() query: InternalClinicalProfessionalListQueryDto) { return this.professionals.list(query); }
}

@ApiTags('Guided Self-Check internal clinical professional administration')
@ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/guided-self-check-clinical-professionals')
export class GuidedSelfCheckInternalClinicalProfessionalAdministrationController {
  constructor(private professionals: GuidedSelfCheckInternalClinicalProfessionalsService) {}
  @Post('authorize') authorize(@Body() dto: AuthorizeInternalClinicalProfessionalDto, @Req() request: { user: User }) { return this.professionals.authorize(dto, request.user.id); }
  @Post(':reference/disable') disable(@Param('reference') reference: string, @Req() request: { user: User }) { return this.professionals.disable(reference, request.user.id); }
  @Post(':reference/capabilities/grant') grant(@Param('reference') reference: string, @Body() dto: ChangeInternalClinicalCapabilityDto, @Req() request: { user: User }) { return this.professionals.changeCapability(reference, dto.capability, true, request.user.id); }
  @Post(':reference/capabilities/revoke') revoke(@Param('reference') reference: string, @Body() dto: ChangeInternalClinicalCapabilityDto, @Req() request: { user: User }) { return this.professionals.changeCapability(reference, dto.capability, false, request.user.id); }
}
