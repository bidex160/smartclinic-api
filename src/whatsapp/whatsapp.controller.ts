import { Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Logger, Post, Query, RawBodyRequest, Req, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { MetaWebhookPayload } from './whatsapp.types';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('Webhooks')
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get() @ApiOperation({ summary: 'Verify the Meta WhatsApp webhook' }) @ApiOkResponse({ type: String })
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    return this.whatsapp.verifyChallenge(mode, token, challenge);
  }

  @Post() @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Receive Meta WhatsApp webhook events' }) @ApiOkResponse()
  async inbound(@Req() request: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature?: string) {
    if (!this.whatsapp.verifySignature(request.rawBody, signature)) throw new ForbiddenException('WhatsApp webhook signature validation failed');
    try { await this.whatsapp.processWebhook(request.body as MetaWebhookPayload); }
    catch { this.logger.error('WhatsApp webhook processing failed'); throw new ServiceUnavailableException('WhatsApp webhook processing temporarily unavailable'); }
    return { received: true };
  }
}
