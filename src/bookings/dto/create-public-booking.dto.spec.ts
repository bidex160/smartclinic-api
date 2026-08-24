import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePublicBookingDto } from './create-public-booking.dto';

describe('CreatePublicBookingDto', () => {
  const validInput = {
    booker: {
      givenName: 'Ada',
      familyName: 'Okafor',
      phone: '+2348012345678',
    },
    participant: {
      relationship: 'SELF',
      givenName: 'Ada',
      familyName: 'Okafor',
    },
    booking: {
      healthCheckPackageId: 'd3f17322-2dab-42bd-a006-35c3b864849d',
      fulfilmentModeId: '3c233f29-a510-4602-a337-df7e2d1e5a4a',
      preferredDate: '2026-08-20',
      preferredTimeFrom: '09:00',
      preferredTimeTo: '12:00',
      preferredTimezone: 'Africa/Lagos',
    },
  };

  it('accepts a valid public booking request', async () => {
    await expect(validate(plainToInstance(CreatePublicBookingDto, validInput))).resolves.toHaveLength(0);
  });

  it('rejects invalid nested public-booking input and unknown fields', async () => {
    const dto = plainToInstance(CreatePublicBookingDto, {
      ...validInput,
      booker: { ...validInput.booker, phone: 'not-a-phone' },
      participant: { ...validInput.participant, relationship: 'COLLEAGUE' },
      booking: { ...validInput.booking, healthCheckPackageId: 'not-a-uuid', unsupported: true },
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).not.toHaveLength(0);
    expect(errors.find((error) => error.property === 'booker')?.children).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'phone' })]),
    );
    expect(errors.find((error) => error.property === 'participant')?.children).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'relationship' })]),
    );
    expect(errors.find((error) => error.property === 'booking')?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'healthCheckPackageId' }),
        expect.objectContaining({ property: 'unsupported' }),
      ]),
    );
  });

  it('rejects schedule fields without a timezone, invalid timezones, and partial time ranges', async () => {
    const withoutTimezone = { ...validInput, booking: { ...validInput.booking, preferredTimezone: undefined } };
    const invalidTimezone = { ...validInput, booking: { ...validInput.booking, preferredTimezone: 'Lagos' } };
    const partial = { ...validInput, booking: { ...validInput.booking, preferredTimeTo: undefined } };
    expect(await validate(plainToInstance(CreatePublicBookingDto, withoutTimezone))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreatePublicBookingDto, invalidTimezone))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreatePublicBookingDto, partial))).toHaveLength(0);
  });
});
