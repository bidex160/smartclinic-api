import { Controller, HttpCode, HttpStatus, NotFoundException, Post, RawBodyRequest, Req, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { OpayPaymentProviderAdapter } from './adapters/opay-payment-provider.adapter';
import { PaymentFlowService } from './payment-flow.service';

@ApiTags('Payment provider webhooks')
@Controller('payments/opay')
export class OpayWebhookController {
  constructor(private readonly opay: OpayPaymentProviderAdapter, private readonly payments: PaymentFlowService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive a signature-authenticated OPay webhook' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse()
  async webhook(@Req() request: RawBodyRequest<Request>) {
    const raw = request.rawBody;
    const signature = this.extractSignature(request);
    if (!raw || !signature || !this.opay.verifyWebhookSignature(raw, signature))
      throw new UnauthorizedException('Invalid payment webhook signature');
    const event = this.opay.parseWebhook(raw);
    if (!event.reference) return { received: true };
    const verified = await this.opay.verifyPayment(event.reference);
    try {
      await this.payments.applyProviderVerification('OPAY', event.reference, verified);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    return { received: true };
  }

  private extractSignature(request: RawBodyRequest<Request>): string | undefined {
    const header = request.headers['signature'] ?? request.headers['x-opay-signature'];
    if (header) return Array.isArray(header) ? header[0] : header;
    try {
      const body = JSON.parse(request.rawBody?.toString('utf8') ?? '{}') as { sha512?: unknown };
      return typeof body.sha512 === 'string' ? body.sha512 : undefined;
    } catch {
      return undefined;
    }
  }
}
