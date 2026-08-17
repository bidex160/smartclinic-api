import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      BookingContact,
      BookingStatusHistory,
      BookingFunding,
      User,
      Patient,
      Organisation,
      HealthCheckPackage,
      FulfilmentMode,
    ]),
  ],
  controllers: [BookingsController, PublicBookingsController],
  providers: [BookingsService, PublicBookingsService],
})
export class BookingsModule {}
