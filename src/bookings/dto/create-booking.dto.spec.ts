import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateBookingDto } from './create-booking.dto';

describe('CreateBookingDto', () => {
  const validInput = {
    bookerUserId: '0b5161b0-9e9c-4baa-9ad5-8d3dc2e10273',
    participantPatientId: '4c7b8fe6-f9c1-4f01-9a0c-68daf48e1e0e',
    healthCheckPackageId: 'd3f17322-2dab-42bd-a006-35c3b864849d',
    fulfilmentModeId: '3c233f29-a510-4602-a337-df7e2d1e5a4a',
    quotedAmount: '12500.00',
    currency: 'ngn',
  };

  it('transforms ISO currency input and accepts a valid request', async () => {
    const dto = plainToInstance(CreateBookingDto, validInput);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.currency).toBe('NGN');
  });

  it('rejects invalid UUIDs, currency codes, amounts, and time values', async () => {
    const dto = plainToInstance(CreateBookingDto, {
      ...validInput,
      bookerUserId: 'not-a-uuid',
      quotedAmount: '12.345',
      currency: 'N',
      preferredTimeWindowStart: '25:00',
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['bookerUserId', 'quotedAmount', 'currency', 'preferredTimeWindowStart']),
    );
  });

  it('rejects unknown properties under the API validation-pipe policy', async () => {
    const dto = plainToInstance(CreateBookingDto, { ...validInput, unsupported: 'value' });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'unsupported' })]),
    );
  });
});
