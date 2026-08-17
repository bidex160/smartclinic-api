import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BookingFunding } from './entities/booking-funding.entity';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';

@Module({ imports: [TypeOrmModule.forFeature([Booking, BookingStatusHistory, BookingFunding])] })
export class BookingsModule {}
