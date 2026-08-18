import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiGoneResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcceptProviderInvitationDto, AcceptedProviderInvitationResponseDto, ProviderInvitationTokenParamsDto, PublicProviderInvitationResponseDto } from './dto/provider-invitation.dto';
import { ProviderInvitationsService } from './provider-invitations.service';

@ApiTags('Public provider invitations') @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiGoneResponse() @ApiConflictResponse()
@Controller('public/provider-invitations')
export class PublicProviderInvitationsController {
  constructor(private readonly invitations: ProviderInvitationsService) {}
  @Get(':token') @ApiOperation({ summary: 'Inspect a valid one-time provider invitation' }) @ApiOkResponse({ type: PublicProviderInvitationResponseDto }) inspect(@Param() { token }: ProviderInvitationTokenParamsDto) { return this.invitations.inspect(token); }
  @Post(':token/accept') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Create the invited provider account; normal login is required afterward' }) @ApiOkResponse({ type: AcceptedProviderInvitationResponseDto }) accept(@Param() { token }: ProviderInvitationTokenParamsDto, @Body() dto: AcceptProviderInvitationDto) { return this.invitations.accept(token, dto); }
}
