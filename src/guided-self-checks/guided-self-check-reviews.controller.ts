import { Body,Controller,Get,Param,Post,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AssignGuidedSelfCheckReviewDto,CancelGuidedSelfCheckReviewDto,CompleteGuidedSelfCheckReviewDto,GuidedSelfCheckReviewListQueryDto } from './dto/guided-self-check-review.dto';
import { GuidedSelfCheckProfessionalReviewsService } from './guided-self-check-professional-reviews.service';

@ApiTags('Admin Guided Self-Check professional reviews') @ApiBearerAuth() @UseGuards(JwtAuthGuard,RolesGuard) @Roles(UserRole.ADMIN,UserRole.OPERATIONS) @Controller('admin/guided-self-check-reviews')
export class AdminGuidedSelfCheckReviewsController{constructor(private s:GuidedSelfCheckProfessionalReviewsService){}@Get()list(@Query()q:GuidedSelfCheckReviewListQueryDto){return this.s.list(q);}@Get(':reference')get(@Param('reference')r:string){return this.s.getAdmin(r);}@Post(':reference/assign')assign(@Param('reference')r:string,@Body()d:AssignGuidedSelfCheckReviewDto,@Req()q:{user:User}){return this.s.assign(r,d,q.user.id);}@Post(':reference/cancel')cancel(@Param('reference')r:string,@Body()d:CancelGuidedSelfCheckReviewDto,@Req()q:{user:User}){return this.s.cancel(r,d,q.user.id);}}

@ApiTags('Provider Guided Self-Check professional reviews') @ApiBearerAuth() @UseGuards(JwtAuthGuard,RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/guided-self-check-reviews')
export class ProviderGuidedSelfCheckReviewsController{constructor(private s:GuidedSelfCheckProfessionalReviewsService){}@Get(':reference')get(@Param('reference')r:string,@Req()q:{user:User}){return this.s.getReviewer(r,q.user);}@Post(':reference/start')start(@Param('reference')r:string,@Req()q:{user:User}){return this.s.start(r,q.user);}@Post(':reference/complete')complete(@Param('reference')r:string,@Req()q:{user:User},@Body()d:CompleteGuidedSelfCheckReviewDto){return this.s.complete(r,q.user,d);}}
