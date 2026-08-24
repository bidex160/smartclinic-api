import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateBookingDto } from './create-booking.dto';

describe('CreateBookingDto', () => {
  const validInput = {
    bookerUserId: '0b5161b0-9e9c-4baa-9ad5-8d3dc2e10273',
    participantPatientId: '4c7b8fe6-f9c1-4f01-9a0c-68daf48e1e0e',
    healthCheckPackageId: 'd3f17322-2dab-42bd-a006-35c3b864849d',
    fulfilmentModeId: '3c233f29-a510-4602-a337-df7e2d1e5a4a',
    preferredDate: '2026-08-20',
    preferredTimeWindowStart: '09:00',
    preferredTimezone: 'Africa/Lagos',
  };

  it('accepts a valid request without client-controlled quote fields', async () => {
    const dto = plainToInstance(CreateBookingDto, validInput);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid UUIDs and time values', async () => {
    const dto = plainToInstance(CreateBookingDto, {
      ...validInput,
      bookerUserId: 'not-a-uuid',
      preferredTimeWindowStart: '25:00',
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['bookerUserId', 'preferredTimeWindowStart']),
    );
  });

  it('rejects unknown properties under the API validation-pipe policy', async () => {
    const dto = plainToInstance(CreateBookingDto, {
      ...validInput,
      quotedAmount: '1.00',
      currency: 'USD',
      unsupported: 'value',
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'quotedAmount' }),
        expect.objectContaining({ property: 'currency' }),
        expect.objectContaining({ property: 'unsupported' }),
      ]),
    );
  });

  it('accepts a complete schedule with a valid IANA timezone', async () => {
    await expect(validate(plainToInstance(CreateBookingDto, { ...validInput, preferredDate: '2026-08-20', preferredTimeWindowStart: '09:00', preferredTimeWindowEnd: '12:00', preferredTimezone: 'Africa/Lagos' }))).resolves.toHaveLength(0);
  });
  it('rejects scheduling without a timezone and rejects invalid timezones', async () => {
    expect(await validate(plainToInstance(CreateBookingDto, { ...validInput, preferredTimezone: undefined }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreateBookingDto, { ...validInput, preferredDate: '2026-08-20', preferredTimezone: 'Lagos' }))).not.toHaveLength(0);
  });
  it('does not require a client-supplied end time', async () => {
    expect(await validate(plainToInstance(CreateBookingDto, validInput))).toHaveLength(0);
  });
});
