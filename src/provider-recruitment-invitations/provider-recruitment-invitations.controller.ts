import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateProviderRecruitmentInvitationDto } from './dto/create-provider-recruitment-invitation.dto';
import { ProviderRecruitmentInvitationResponseDto } from './dto/provider-recruitment-invitation-response.dto';
import { ProviderRecruitmentInvitationsService } from './provider-recruitment-invitations.service';

@ApiTags('My Provider Invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/provider-invitations')
export class ProviderRecruitmentInvitationsController {
  constructor(private readonly invitations: ProviderRecruitmentInvitationsService) {}

  @Post()
  @ApiOperation({ summary: 'Invite an organisation after Health Check provider discovery returns no providers' })
  @ApiCreatedResponse({ type: ProviderRecruitmentInvitationResponseDto })
  create(@Req() request: { user: User }, @Body() dto: CreateProviderRecruitmentInvitationDto) {
    return this.invitations.create(request.user, dto);
  }
}
