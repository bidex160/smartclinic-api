import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AssignInternalClinicalProfessionalDto, CancelGuidedSelfCheckReviewDto, CompleteGuidedSelfCheckReviewDto, GuidedSelfCheckMyReviewListQueryDto, GuidedSelfCheckReviewListQueryDto, TriageGuidedSelfCheckReviewDto } from './dto/guided-self-check-review.dto';
import { GuidedSelfCheckProfessionalReviewsService } from './guided-self-check-professional-reviews.service';

@ApiTags('Internal Guided Self-Check urgent reviews')
@ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/guided-self-check-reviews')
export class AdminGuidedSelfCheckReviewsController {
  constructor(private reviews: GuidedSelfCheckProfessionalReviewsService) {}
  @Get() list(@Query() query: GuidedSelfCheckReviewListQueryDto) { return this.reviews.list(query); }
  @Get(':reference') get(@Param('reference') reference: string) { return this.reviews.getAdmin(reference); }
  @Post(':reference/acknowledge') acknowledge(@Param('reference') reference: string, @Req() request: { user: User }) { return this.reviews.acknowledge(reference, request.user.id); }
  @Post(':reference/escalate') escalate(@Param('reference') reference: string, @Body() dto: TriageGuidedSelfCheckReviewDto, @Req() request: { user: User }) { return this.reviews.escalate(reference, dto.note, request.user.id); }
  @Post(':reference/assign') assign(@Param('reference') reference: string, @Body() dto: AssignInternalClinicalProfessionalDto, @Req() request: { user: User }) { return this.reviews.assignInternal(reference, dto, request.user.id); }
  @Post(':reference/cancel') cancel(@Param('reference') reference: string, @Body() dto: CancelGuidedSelfCheckReviewDto, @Req() request: { user: User }) { return this.reviews.cancel(reference, dto, request.user.id); }
}

@ApiTags('My internal Guided Self-Check clinical reviews')
@ApiBearerAuth() @UseGuards(JwtAuthGuard)
@Controller('internal/guided-self-check-reviews')
export class InternalClinicalGuidedSelfCheckReviewsController {
  constructor(private reviews: GuidedSelfCheckProfessionalReviewsService) {}
  @Get() listMine(@Query() query: GuidedSelfCheckMyReviewListQueryDto, @Req() request: { user: User }) { return this.reviews.listMine(request.user, query); }
  @Get(':reference') get(@Param('reference') reference: string, @Req() request: { user: User }) { return this.reviews.getInternalClinical(reference, request.user); }
  @Post(':reference/start') start(@Param('reference') reference: string, @Req() request: { user: User }) { return this.reviews.startInternal(reference, request.user); }
  @Post(':reference/complete') complete(@Param('reference') reference: string, @Body() dto: CompleteGuidedSelfCheckReviewDto, @Req() request: { user: User }) { return this.reviews.completeInternal(reference, request.user, dto); }
}
