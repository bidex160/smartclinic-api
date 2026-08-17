import { Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BookingReferenceParamsDto } from '../bookings/dto/booking-reference-params.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ExpireStaleOffersResponseDto, MatchingResultResponseDto, ProviderAssignmentResponseDto } from './dto/provider-assignment-response.dto';
import { ResourceIdParamsDto } from './dto/provider-params.dto';
import { ProviderMatchingService } from './provider-matching.service';

@ApiTags('Admin provider matching') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
@Controller('admin')
export class AdminProviderMatchingController {
  constructor(private readonly matching: ProviderMatchingService) {}
  @Post('bookings/:reference/matching/start') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Start or retry sequential provider matching (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: MatchingResultResponseDto })
  start(@Param() { reference }: BookingReferenceParamsDto, @Req() request: { user: User }) { return this.matching.startMatching(reference, request.user.id); }
  @Post('provider-assignments/:id/confirm') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Confirm an accepted provider assignment (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ProviderAssignmentResponseDto })
  confirm(@Param() { id }: ResourceIdParamsDto, @Req() request: { user: User }) { return this.matching.confirmAssignment(id, request.user.id); }
  @Post('provider-assignments/expire-stale') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Expire stale offers and continue sequential matching (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ExpireStaleOffersResponseDto })
  expire(@Req() request: { user: User }) { return this.matching.expireStaleOffers(request.user.id); }
}
