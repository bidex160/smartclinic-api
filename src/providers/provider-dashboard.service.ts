import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { HealthCheckEncounter } from '../health-checks/entities/health-check-encounter.entity';
import { HealthCheckEncounterStatus } from '../health-checks/enums/health-check-encounter-status.enum';
import { User } from '../users/entities/user.entity';
import { CurrentProviderService } from './current-provider.service';
import { ProviderDashboardSummaryDto } from './dto/provider-dashboard-summary.dto';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { ReferralsService } from '../rewards/referrals.service';

@Injectable()
export class ProviderDashboardService {
  constructor(
    @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>,
    private readonly currentProvider: CurrentProviderService,
    private readonly referrals: ReferralsService,
  ) {}

  async summary(user: User, now = new Date()): Promise<ProviderDashboardSummaryDto> {
    const provider = await this.currentProvider.resolve(user);
    const [newOffers, appointmentCounts, inProgress, completed, referralSummary] = await Promise.all([
      this.assignments.count({ where: { providerId: provider.id, status: ProviderAssignmentStatus.OFFERED, expiresAt: MoreThan(now) } }),
      this.appointmentCounts(provider.id),
      this.encounters.count({ where: { providerId: provider.id, status: HealthCheckEncounterStatus.IN_PROGRESS } }),
      this.encounters.count({ where: { providerId: provider.id, status: HealthCheckEncounterStatus.COMPLETED } }),
      this.referrals.summary(user.id),
    ]);
    return {
      offers: { new: newOffers },
      appointments: appointmentCounts,
      healthChecks: { inProgress, completed },
      referrals: {
        availablePoints: referralSummary.availablePoints,
        currentLevel: referralSummary.currentLevel,
        nextLevel: referralSummary.nextLevel,
        qualifiedPatients: referralSummary.progress.patients.qualified,
        qualifiedClinics: referralSummary.progress.clinics.qualified,
        qualifiedLaboratories: referralSummary.progress.laboratories.qualified,
        qualifiedPharmacies: referralSummary.progress.pharmacies.qualified,
      },
    };
  }

  private async appointmentCounts(providerId: string): Promise<{ today: number; upcoming: number }> {
    const row = await this.bookings
      .createQueryBuilder('booking')
      .innerJoin('provider_assignments', 'assignment', 'assignment.booking_id = booking.id AND assignment.provider_id = :providerId AND assignment.status = :confirmed', {
        providerId,
        confirmed: ProviderAssignmentStatus.CONFIRMED,
      })
      .where('booking.status = :scheduled', { scheduled: BookingStatus.SCHEDULED })
      .andWhere('booking.scheduledDate IS NOT NULL')
      .andWhere('booking.scheduledTimezone IS NOT NULL')
      .select(`COUNT(DISTINCT booking.id) FILTER (WHERE booking.scheduledDate = (CURRENT_TIMESTAMP AT TIME ZONE booking.scheduledTimezone)::date)`, 'today')
      .addSelect(`COUNT(DISTINCT booking.id) FILTER (WHERE booking.scheduledDate > (CURRENT_TIMESTAMP AT TIME ZONE booking.scheduledTimezone)::date)`, 'upcoming')
      .getRawOne<{ today: string; upcoming: string }>();
    return { today: Number(row?.today ?? 0), upcoming: Number(row?.upcoming ?? 0) };
  }
}
