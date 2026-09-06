import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSelfBookingDto } from './create-self-booking.dto';

describe('CreateSelfBookingDto', () => {
  const input = {
    configurationReference: 'SC-HCQ-C8EA40D524DFB230',
    preferredDate: '2026-09-10',
    preferredTimeWindowStart: '09:00',
    preferredTimezone: 'Africa/Lagos',
  };

  it('keeps the existing SELF contract valid when participantPatientReference is omitted', async () => {
    await expect(validate(plainToInstance(CreateSelfBookingDto, input))).resolves.toHaveLength(0);
  });

  it('accepts a public Patient reference and rejects internal ownership fields', async () => {
    await expect(validate(plainToInstance(CreateSelfBookingDto, { ...input, participantPatientReference: 'SCP-CHLD-0001' }))).resolves.toHaveLength(0);
    const errors = await validate(plainToInstance(CreateSelfBookingDto, {
      ...input,
      participantPatientId: '4c7b8fe6-f9c1-4f01-9a0c-68daf48e1e0e',
      participantUserId: '0b5161b0-9e9c-4baa-9ad5-8d3dc2e10273',
      bookerUserId: '0b5161b0-9e9c-4baa-9ad5-8d3dc2e10273',
    }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['participantPatientId', 'participantUserId', 'bookerUserId']));
  });

  it('rejects a malformed participant public reference', async () => {
    const errors = await validate(plainToInstance(CreateSelfBookingDto, { ...input, participantPatientReference: 'dependant-internal-id' }));
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'participantPatientReference' })]));
  });
});
