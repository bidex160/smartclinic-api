import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExternalFastTrackDto } from './fasttrack.dto';

describe('CreateExternalFastTrackDto family contract', () => {
  const input = { providerReference: 'SCPR-ABCDEF0123456789', serviceCode: 'GENERAL_CONSULTATION', externalAppointmentReference: 'EXT-100', appointmentDate: '2026-09-10' };

  it('preserves the existing SELF payload and accepts an optional public participant reference', async () => {
    await expect(validate(plainToInstance(CreateExternalFastTrackDto, input))).resolves.toHaveLength(0);
    await expect(validate(plainToInstance(CreateExternalFastTrackDto, { ...input, participantPatientReference: 'SCP-CHLD-0001' }))).resolves.toHaveLength(0);
  });

  it('rejects malformed references and internal ownership fields', async () => {
    expect(await validate(plainToInstance(CreateExternalFastTrackDto, { ...input, participantPatientReference: 'patient-uuid' }))).not.toHaveLength(0);
    const errors = await validate(plainToInstance(CreateExternalFastTrackDto, { ...input, patientId: 'internal', participantPatientId: 'internal', userId: 'spoof' }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['patientId', 'participantPatientId', 'userId']));
  });
});
