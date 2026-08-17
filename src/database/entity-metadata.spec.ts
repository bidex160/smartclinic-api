import { getMetadataArgsStorage } from 'typeorm';

import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { Organisation } from '../organisations/entities/organisation.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { ProviderAssignmentHistory } from '../providers/entities/provider-assignment-history.entity';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';

describe('entity metadata', () => {
  const storage = getMetadataArgsStorage();

  const findColumn = (target: Function, propertyName: string) =>
    storage.columns.find(
      (column) => column.target === target && column.propertyName === propertyName,
    );

  it('registers the approved initial relational tables', () => {
    const tables = getMetadataArgsStorage().tables.map((table) => table.target);

    expect(tables).toEqual(
      expect.arrayContaining([
        User,
        Patient,
        Provider,
        Organisation,
        HealthCheckPackage,
        FulfilmentMode,
        Booking,
        BookingStatusHistory,
        BookingFunding,
        PaymentAttempt,
        PaymentTransaction,
        ProviderAssignment,
        ProviderAssignmentHistory,
      ]),
    );
  });

  it('declares the single-confirmed-assignment partial unique index', () => {
    const index = storage.indices.find(
      (candidate) =>
        candidate.target === ProviderAssignment &&
        candidate.name === 'UQ_provider_assignments_confirmed_booking',
    );

    expect(index).toMatchObject({
      unique: true,
      where: '"status" = \'CONFIRMED\'',
    });
  });

  it('uses UUID primary keys and preserves required relationship nullability', () => {
    const entityClasses = [
      User,
      Patient,
      Provider,
      Organisation,
      HealthCheckPackage,
      FulfilmentMode,
      Booking,
      BookingStatusHistory,
      BookingFunding,
      PaymentAttempt,
      PaymentTransaction,
      ProviderAssignment,
      ProviderAssignmentHistory,
    ];

    for (const entity of entityClasses) {
      expect(findColumn(entity, 'id')).toMatchObject({
        options: { type: 'uuid', primary: true },
      });
    }

    expect(findColumn(Patient, 'userId')).toMatchObject({ options: { nullable: true } });
    expect(findColumn(Provider, 'userId')).toMatchObject({ options: { nullable: true } });
    for (const [entity, propertyName] of [
      [Booking, 'bookerUserId'],
      [Booking, 'participantPatientId'],
      [BookingFunding, 'bookingId'],
      [PaymentAttempt, 'bookingFundingId'],
    ] as const) {
      expect(findColumn(entity, propertyName)?.options.nullable).not.toBe(true);
    }
    expect(findColumn(PaymentTransaction, 'paymentAttemptId')).toMatchObject({ options: { nullable: true } });
  });

  it('keeps booking funding and payments distinct with fixed-precision ISO monetary fields', () => {
    expect(BookingFunding.name).toBeDefined();
    expect(findColumn(BookingFunding, 'amount')).toMatchObject({
      options: { type: 'numeric', precision: 12, scale: 2, nullable: true },
    });

    for (const [entity, amountProperty, currencyProperty] of [
      [Booking, 'quotedAmount', 'currency'],
      [BookingFunding, 'amount', 'currency'],
      [PaymentAttempt, 'amount', 'currency'],
      [PaymentTransaction, 'amount', 'currency'],
    ] as const) {
      expect(findColumn(entity, amountProperty)).toMatchObject({
        options: { type: 'numeric', precision: 12, scale: 2 },
      });
      expect(findColumn(entity, currencyProperty)).toMatchObject({
        options: { type: 'char', length: 3 },
      });
    }

    expect(findColumn(Booking, 'bookingReference')).toBeDefined();
    expect(
      storage.indices.find(
        (candidate) =>
          candidate.target === Booking && candidate.name === 'UQ_bookings_booking_reference',
      ),
    ).toMatchObject({ unique: true });
    expect(storage.relations.filter((relation) => relation.target === BookingFunding)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: 'paymentAttempts', relationType: 'one-to-many' }),
      ]),
    );
  });

  it('records booking and provider-assignment histories as separate relational audit trails', () => {
    expect(storage.relations.filter((relation) => relation.target === Booking)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: 'statusHistory', relationType: 'one-to-many' }),
        expect.objectContaining({ propertyName: 'funding', relationType: 'one-to-many' }),
        expect.objectContaining({ propertyName: 'providerAssignments', relationType: 'one-to-many' }),
      ]),
    );
    expect(storage.relations.filter((relation) => relation.target === ProviderAssignment)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: 'history', relationType: 'one-to-many' }),
      ]),
    );
  });
});
