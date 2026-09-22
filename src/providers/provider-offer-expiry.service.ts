import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config';
import { ProviderMatchingService } from './provider-matching.service';

@Injectable()
export class ProviderOfferExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderOfferExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    private readonly matching: ProviderMatchingService,
  ) {}
  onModuleInit(): void {
    if (!this.config.providerMatching.expiryWorkerEnabled) return;
    this.timer = setInterval(() => { void this.tick(); }, this.config.providerMatching.expiryIntervalMs ?? 60_000);
    this.timer.unref?.();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.matching.expireStaleOffers(null);
    } catch {
      this.logger.warn('Provider offer expiry failed; processing will retry on the next interval');
    } finally {
      this.running = false;
    }
  }
}
