import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { InviteProviderMemberDto, ProviderMemberIdParamsDto, TeamInvitationTokenParamsDto, UpdateProviderMemberDto } from './dto/provider-team.dto';
import { ProviderTeamService } from './provider-team.service';

@ApiTags('Provider team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/team')
export class ProviderTeamController {
  constructor(private readonly team: ProviderTeamService) {}

  @Get('me') @ApiOperation({ summary: 'Your role at your facility' })
  me(@Req() r: { user: User }) {
    return this.team.me(r.user);
  }

  @Get() @ApiOperation({ summary: 'Team members (owner and team admins)' })
  list(@Req() r: { user: User }) {
    return this.team.list(r.user);
  }

  @Post('invitations') @ApiOperation({ summary: 'Invite a staff member by email' })
  invite(@Req() r: { user: User }, @Body() dto: InviteProviderMemberDto) {
    return this.team.invite(r.user, dto);
  }

  @Post(':id/resend') @HttpCode(HttpStatus.OK)
  resend(@Req() r: { user: User }, @Param() p: ProviderMemberIdParamsDto) {
    return this.team.resend(r.user, p.id);
  }

  @Patch(':id')
  update(@Req() r: { user: User }, @Param() p: ProviderMemberIdParamsDto, @Body() dto: UpdateProviderMemberDto) {
    return this.team.updateRole(r.user, p.id, dto.role);
  }

  @Delete(':id')
  remove(@Req() r: { user: User }, @Param() p: ProviderMemberIdParamsDto) {
    return this.team.remove(r.user, p.id);
  }
}

@ApiTags('Public team invitations')
@Controller('public/team-invitations')
export class PublicTeamInvitationsController {
  constructor(private readonly team: ProviderTeamService) {}

  @Get(':token') @ApiOperation({ summary: 'What a team invitation is for' })
  inspect(@Param() p: TeamInvitationTokenParamsDto) {
    return this.team.inspect(p.token);
  }
}

@ApiTags('Team invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.PROVIDER)
@Controller('team-invitations')
export class TeamInvitationsController {
  constructor(private readonly team: ProviderTeamService) {}

  @Post(':token/accept') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Join the facility as the signed-in person' })
  accept(@Req() r: { user: User }, @Param() p: TeamInvitationTokenParamsDto) {
    return this.team.accept(r.user, p.token);
  }
}
