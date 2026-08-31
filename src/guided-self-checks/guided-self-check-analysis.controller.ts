import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { GuidedSelfCheckAnalysisListQueryDto } from './dto/guided-self-check-analysis.dto';
import { GuidedSelfCheckAnalysisService } from './guided-self-check-analysis.service';

@ApiTags('Guided Self-Check internal analyses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/guided-self-check-analyses')
export class GuidedSelfCheckAnalysisController {
  constructor(private analyses: GuidedSelfCheckAnalysisService) {}

  @Get()
  list(@Query() query: GuidedSelfCheckAnalysisListQueryDto) {
    return this.analyses.list(query.status, query.page, query.limit);
  }

  @Get(':reference')
  get(@Param('reference') reference: string) {
    return this.analyses.get(reference);
  }

  @Post(':reference/process')
  process(@Param('reference') reference: string) {
    return this.analyses.process(reference);
  }
}
