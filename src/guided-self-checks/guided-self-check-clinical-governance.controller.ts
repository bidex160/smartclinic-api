import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import {
  AuthorizeClinicalGovernanceDto,
  CreateClinicalRulesetDto,
  DisableClinicalGovernanceDto,
  GovernanceNoteDto,
  RulesetListQueryDto,
  SimulateClinicalRulesetDto,
  UpdateClinicalRulesetDto,
} from './dto/guided-self-check-clinical-governance.dto';
import { GuidedSelfCheckClinicalGovernanceService } from './guided-self-check-clinical-governance.service';

@ApiTags('Guided Self-Check clinical governance authorizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/guided-self-check-clinical-governance-authorizations')
export class GuidedSelfCheckClinicalGovernanceAuthorizationsController {
  constructor(private service: GuidedSelfCheckClinicalGovernanceService) {}
  @Get() list() { return this.service.listAuthorizations(); }
  @Post('authorize') authorize(@Body() dto: AuthorizeClinicalGovernanceDto, @Req() request: { user: User }) { return this.service.authorizeInternal(dto, request.user.id); }
  @Post(':reference/disable') disable(@Param('reference') reference: string, @Body() dto: DisableClinicalGovernanceDto, @Req() request: { user: User }) { return this.service.disable(reference, dto, request.user.id); }
}

@ApiTags('Guided Self-Check clinical ruleset governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/guided-self-check-rulesets')
export class GuidedSelfCheckClinicalRulesetsController {
  constructor(private service: GuidedSelfCheckClinicalGovernanceService) {}
  @Get() list(@Query() query: RulesetListQueryDto, @Req() request: { user: User }) { return this.service.list(query, request.user.id); }
  @Get(':reference') get(@Param('reference') reference: string, @Req() request: { user: User }) { return this.service.get(reference, request.user.id); }
  @Post() create(@Body() dto: CreateClinicalRulesetDto, @Req() request: { user: User }) { return this.service.create(dto, request.user.id); }
  @Patch(':reference') update(@Param('reference') reference: string, @Body() dto: UpdateClinicalRulesetDto, @Req() request: { user: User }) { return this.service.update(reference, dto, request.user.id); }
  @Post(':reference/validate') validate(@Param('reference') reference: string, @Req() request: { user: User }) { return this.service.validate(reference, request.user.id); }
  @Post(':reference/submit-review') submit(@Param('reference') reference: string, @Body() dto: GovernanceNoteDto, @Req() request: { user: User }) { return this.service.submit(reference, dto, request.user.id); }
  @Post(':reference/approve') approve(@Param('reference') reference: string, @Body() dto: GovernanceNoteDto, @Req() request: { user: User }) { return this.service.approve(reference, dto, request.user.id); }
  @Post(':reference/mark-ready') ready(@Param('reference') reference: string, @Body() dto: GovernanceNoteDto, @Req() request: { user: User }) { return this.service.markReady(reference, dto, request.user.id); }
  @Post(':reference/activate') activate(@Param('reference') reference: string, @Body() dto: GovernanceNoteDto, @Req() request: { user: User }) { return this.service.activate(reference, dto, request.user.id); }
  @Post(':reference/retire') retire(@Param('reference') reference: string, @Body() dto: GovernanceNoteDto, @Req() request: { user: User }) { return this.service.retire(reference, dto, request.user.id); }
  @Post(':reference/simulate') simulate(@Param('reference') reference: string, @Body() dto: SimulateClinicalRulesetDto, @Req() request: { user: User }) { return this.service.simulate(reference, dto, request.user.id); }
}
