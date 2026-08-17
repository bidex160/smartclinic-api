import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { DeclineProviderOfferDto } from './dto/decline-provider-offer.dto';
import { ProviderOfferListQueryDto } from './dto/provider-offer-list-query.dto';
import { ProviderOfferResponseDto } from './dto/provider-offer-response.dto';
import { ResourceIdParamsDto } from './dto/provider-params.dto';
import { ProviderOffersService } from './provider-offers.service';

@ApiTags('Provider offers') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@ApiUnauthorizedResponse() @ApiForbiddenResponse({ description: 'PROVIDER role and an active linked Provider are required.' }) @ApiBadRequestResponse() @ApiNotFoundResponse({ description: 'Offer was not found for the authenticated provider.' })
@Controller('provider/offers')
export class ProviderOffersController {
  constructor(private readonly offers: ProviderOffersService) {}
  @Get() @ApiOperation({ summary: 'List the authenticated provider’s offers (PROVIDER)' }) @ApiOkResponse({ type: ProviderOfferResponseDto, isArray: true })
  list(@Req() request: { user: User }, @Query() query: ProviderOfferListQueryDto) { return this.offers.list(request.user, query.status); }
  @Get(':id') @ApiOperation({ summary: 'Get an offer owned by the authenticated provider (PROVIDER)' }) @ApiOkResponse({ type: ProviderOfferResponseDto })
  get(@Req() request: { user: User }, @Param() { id }: ResourceIdParamsDto) { return this.offers.get(request.user, id); }
  @Post(':id/accept') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Accept an owned, unexpired offer (PROVIDER)' }) @ApiOkResponse({ type: ProviderOfferResponseDto }) @ApiConflictResponse({ description: 'Offer is no longer actionable or has expired.' })
  accept(@Req() request: { user: User }, @Param() { id }: ResourceIdParamsDto) { return this.offers.accept(request.user, id); }
  @Post(':id/decline') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Decline an owned, unexpired offer (PROVIDER)' }) @ApiOkResponse({ type: ProviderOfferResponseDto }) @ApiConflictResponse({ description: 'Offer is no longer actionable or has expired.' })
  decline(@Req() request: { user: User }, @Param() { id }: ResourceIdParamsDto, @Body() dto: DeclineProviderOfferDto) { return this.offers.decline(request.user, id, dto.reason); }
}
