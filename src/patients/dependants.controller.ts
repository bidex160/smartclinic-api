import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateDependantDto, DependantResponseDto, DependantsListResponseDto, PatientReferenceParamsDto } from './dto/dependant.dto';
import { DependantsService } from './dependants.service';

@ApiTags('My dependants') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me/dependants')
export class MeDependantsController {
  constructor(private readonly dependants: DependantsService) {}
  @Post() @ApiOperation({ summary: 'Create a new dependant Patient and guardian relationship' }) @ApiCreatedResponse({ type: DependantResponseDto })
  create(@Req() request: { user: User }, @Body() dto: CreateDependantDto) { return this.dependants.create(request.user, dto); }
  @Get() @ApiOperation({ summary: 'List dependants managed by the authenticated patient account' }) @ApiOkResponse({ type: DependantsListResponseDto })
  list(@Req() request: { user: User }) { return this.dependants.list(request.user); }
  @Get(':patientReference') @ApiOperation({ summary: 'Get one authorized dependant' }) @ApiOkResponse({ type: DependantResponseDto })
  get(@Req() request: { user: User }, @Param() params: PatientReferenceParamsDto) { return this.dependants.get(request.user, params.patientReference); }
}
