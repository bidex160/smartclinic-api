import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CreatePackagePriceDto } from './dto/create-package-price.dto';
import { PackagePriceIdParamsDto } from './dto/package-price-id-params.dto';
import { PackagePriceListQueryDto } from './dto/package-price-list-query.dto';
import { PackagePriceResponseDto } from './dto/package-price-response.dto';
import { PackagePricesService } from './package-prices.service';

@ApiTags('Admin package prices') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/package-prices')
export class AdminPackagePricesController {
  constructor(private readonly prices: PackagePricesService) {}
  @Get() @ApiOperation({ summary: 'List package prices (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: PackagePriceResponseDto, isArray: true }) @ApiUnauthorizedResponse() @ApiForbiddenResponse()
  findAll(@Query() query: PackagePriceListQueryDto): Promise<PackagePriceResponseDto[]> { return this.prices.findAll(query); }
  @Post('schedule') @ApiOperation({ summary: 'Schedule a package price (ADMIN or OPERATIONS)' }) @ApiCreatedResponse({ type: PackagePriceResponseDto }) @ApiBadRequestResponse() @ApiConflictResponse() @ApiUnprocessableEntityResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse()
  schedule(@Body() dto: CreatePackagePriceDto): Promise<PackagePriceResponseDto> { return this.prices.schedule(dto); }
  @Post() @ApiOperation({ summary: 'Create a package price (ADMIN or OPERATIONS)' }) @ApiCreatedResponse({ type: PackagePriceResponseDto }) @ApiBadRequestResponse() @ApiConflictResponse() @ApiUnprocessableEntityResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse()
  create(@Body() dto: CreatePackagePriceDto): Promise<PackagePriceResponseDto> { return this.prices.create(dto); }
  @Patch(':id/deactivate') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Deactivate a package price (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: PackagePriceResponseDto }) @ApiNotFoundResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse()
  deactivate(@Param() { id }: PackagePriceIdParamsDto): Promise<PackagePriceResponseDto> { return this.prices.deactivate(id); }
  @Get(':id') @ApiOperation({ summary: 'Get a package price (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: PackagePriceResponseDto }) @ApiNotFoundResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse()
  findOne(@Param() { id }: PackagePriceIdParamsDto): Promise<PackagePriceResponseDto> { return this.prices.findOne(id); }
}
