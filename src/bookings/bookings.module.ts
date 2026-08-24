import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { HealthChecksModule } from '../health-checks/health-checks.module';
import { Organisation } from '../organisations/entities/organisation.entity';
import { Patient } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PublicBookingsController } from './public-bookings.controller';
import { PublicBookingsService } from './public-bookings.service';
import { BookingContact } from './entities/booking-contact.entity';
import { BookingFunding } from './entities/booking-funding.entity';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import { AuthModule } from '../auth/auth.module';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { ProviderAssignmentHistory } from '../providers/entities/provider-assignment-history.entity';
import { ProviderBookingReservation } from '../providers/entities/provider-booking-reservation.entity';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { AdminBookingLifecycleController } from './admin-booking-lifecycle.controller';
import { PublicBookingSession } from './entities/public-booking-session.entity';
import { PublicBookingSessionService } from './public-booking-session.service';
import { PaymentsModule } from '../payments/payments.module';
import { HealthResultAccessGrant } from '../health-checks/entities/health-result-access-grant.entity';
import { MePatientLinkingController } from './me-patient-linking.controller';
import { PatientAccountLinkingService } from './patient-account-linking.service';
import { BookingVisitAddress } from './entities/booking-visit-address.entity';

@Module({
  imports: [
    HealthChecksModule,
    AuthModule,
    PaymentsModule,
    TypeOrmModule.forFeature([
      Booking,
      BookingVisitAddress,
      BookingContact,
      BookingStatusHistory,
      BookingFunding,
      User,
      Patient,
      Organisation,
      HealthCheckPackage,
      FulfilmentMode,
      ProviderAssignment,
      ProviderAssignmentHistory,
      ProviderBookingReservation,
      PublicBookingSession,
      HealthResultAccessGrant,
    ]),
  ],
  controllers: [BookingsController, PublicBookingsController, AdminBookingLifecycleController, MePatientLinkingController],
  providers: [BookingsService, PublicBookingsService, BookingLifecycleService, PublicBookingSessionService, PatientAccountLinkingService],
})
export class BookingsModule {}
