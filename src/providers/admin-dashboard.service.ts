import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { HealthCheckEncounter } from '../health-checks/entities/health-check-encounter.entity';
import { HealthCheckEncounterStatus } from '../health-checks/enums/health-check-encounter-status.enum';
import { AdminDashboardSummaryDto } from './dto/admin-dashboard-summary.dto';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { Provider } from './entities/provider.entity';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ReferralsService } from '../rewards/referrals.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>,
    @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    private readonly referrals: ReferralsService,
  ) {}

  async summary(now = new Date()): Promise<AdminDashboardSummaryDto> {
    const [bookingCounts, activeOffers, inProgress, completed, providerCounts, referrals] = await Promise.all([
      this.bookingCounts(),
      this.assignments.count({ where: { status: ProviderAssignmentStatus.OFFERED, expiresAt: MoreThan(now) } }),
      this.encounters.count({ where: { status: HealthCheckEncounterStatus.IN_PROGRESS } }),
      this.encounters.count({ where: { status: HealthCheckEncounterStatus.COMPLETED } }),
      this.providerCounts(),
      this.referrals.adminMetrics(),
    ]);
    return {
      bookings: { ...bookingCounts, inProgress, completed },
      matching: { activeOffers },
      providers: providerCounts,
      referrals,
    };
  }

  private async bookingCounts() {
    const row = await this.bookings.createQueryBuilder('booking')
      .select(`COUNT(*) FILTER (WHERE booking.status = :awaitingFunding)`, 'awaitingFunding')
      .addSelect(`COUNT(*) FILTER (WHERE booking.status = :pendingProviderMatch)`, 'pendingProviderMatch')
      .addSelect(`COUNT(*) FILTER (WHERE booking.status = :scheduled)`, 'scheduled')
      .addSelect(`COUNT(*) FILTER (WHERE booking.status = :needsAttention)`, 'needsAttention')
      .setParameters({ awaitingFunding: BookingStatus.AWAITING_FUNDING, pendingProviderMatch: BookingStatus.PENDING_PROVIDER_MATCH, scheduled: BookingStatus.SCHEDULED, needsAttention: BookingStatus.UNFULFILLABLE })
      .getRawOne<{ awaitingFunding: string; pendingProviderMatch: string; scheduled: string; needsAttention: string }>();
    return { awaitingFunding: Number(row?.awaitingFunding ?? 0), pendingProviderMatch: Number(row?.pendingProviderMatch ?? 0), scheduled: Number(row?.scheduled ?? 0), needsAttention: Number(row?.needsAttention ?? 0) };
  }

  private async providerCounts() {
    const row = await this.providers.createQueryBuilder('provider')
      .select(`COUNT(*) FILTER (WHERE provider.onboardingStatus = :submitted AND provider.status = :pending)`, 'pendingReview')
      .addSelect(`COUNT(*) FILTER (WHERE provider.status = :active)`, 'active')
      .where('provider.deletedAt IS NULL')
      .setParameters({ submitted: ProviderOnboardingStatus.SUBMITTED, pending: ProviderStatus.PENDING, active: ProviderStatus.ACTIVE })
      .getRawOne<{ pendingReview: string; active: string }>();
    return { pendingReview: Number(row?.pendingReview ?? 0), active: Number(row?.active ?? 0) };
  }
}
