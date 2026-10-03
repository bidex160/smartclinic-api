import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { AdminProvidersService } from './admin-providers.service';
import { ProviderOnboardingReadinessService } from './provider-onboarding-readiness.service';

/**
 * Facilities whose licence was confirmed automatically from the national registry don't wait for
 * a staff approval: once their own setup is complete (services, location, opening hours), they
 * are approved and patients can book them. Everyone else is still approved by staff.
 */
@Injectable()
export class ProviderAutoApprovalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderAutoApprovalService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly admin: AdminProvidersService,
    private readonly readiness: ProviderOnboardingReadinessService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test' || this.config?.get('PROVIDER_AUTO_APPROVAL_ENABLED') === 'false') return;
    this.interval = setInterval(() => {
      this.run().catch((e) => this.logger.warn(`Auto-approval failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, 15 * 60_000);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  /** Approve this one provider now if it qualifies (used straight after a registry claim). */
  async approveIfAutomatic(providerId: string): Promise<boolean> {
    const [row] = await this.dataSource.query(
      `SELECT p.id FROM providers p JOIN provider_credentials c ON c.provider_id = p.id
       WHERE p.id = $1 AND p.deleted_at IS NULL AND p.onboarding_status = 'SUBMITTED' AND p.status = 'ACTIVE' AND p.user_id IS NOT NULL
         AND c.status = 'VERIFIED' AND c.regulator = 'NHFR' AND c.reviewed_by_user_id IS NULL`,
      [providerId],
    );
    if (!row) return false;
    const r = await this.readiness.evaluateAccountReadiness(providerId).catch(() => null);
    if (!r || r.blockers.length) return false;
    try {
      await this.admin.approve(providerId, null);
      return true;
    } catch {
      return false;
    }
  }

  async run(): Promise<string[]> {
    const due: { id: string }[] = await this.dataSource.query(
      `SELECT p.id FROM providers p
       JOIN provider_credentials c ON c.provider_id = p.id
       WHERE p.deleted_at IS NULL AND p.onboarding_status = 'SUBMITTED' AND p.status = 'ACTIVE' AND p.user_id IS NOT NULL
         AND c.status = 'VERIFIED' AND c.regulator = 'NHFR' AND c.reviewed_by_user_id IS NULL
       ORDER BY p.submitted_at ASC NULLS LAST LIMIT 100`,
    );
    const approved: string[] = [];
    for (const { id } of due) {
      const r = await this.readiness.evaluateAccountReadiness(id).catch(() => null);
      if (!r || r.blockers.length) continue;
      try {
        await this.admin.approve(id, null);
        approved.push(id);
      } catch {
        // Not ready after all (or approved meanwhile): try again next run.
      }
    }
    return approved;
  }
}
