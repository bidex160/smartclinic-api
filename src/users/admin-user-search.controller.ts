import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from './enums/user-role.enum';
import { AdminUserSearchService } from './admin-user-search.service';
import { AdminUserSearchQueryDto, AdminUserSearchResponseDto } from './dto/admin-user-search.dto';

@ApiTags('Admin users') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiBadRequestResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse()
@Controller('admin/users')
export class AdminUserSearchController {
  constructor(private readonly searchService: AdminUserSearchService) {}
  @Get('search') @ApiOperation({ summary: 'Search existing users for explicit provider-account linking (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: AdminUserSearchResponseDto })
  search(@Query() query: AdminUserSearchQueryDto) { return this.searchService.search(query); }
}
