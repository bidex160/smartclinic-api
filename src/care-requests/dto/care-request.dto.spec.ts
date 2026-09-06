import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CareRequestContactMethod } from '../enums/care-request-contact-method.enum';
import { CreateCareRequestDto } from './care-request.dto';

describe('CreateCareRequestDto family contract', () => {
  const input = { serviceCode: 'GENERAL_CONSULTATION', deliveryMode: 'VIRTUAL', contactMethod: CareRequestContactMethod.WHATSAPP };
  it('keeps SELF requests valid and accepts a public participant reference', async () => {
    await expect(validate(plainToInstance(CreateCareRequestDto, input))).resolves.toHaveLength(0);
    await expect(validate(plainToInstance(CreateCareRequestDto, { ...input, participantPatientReference: 'SCP-CHLD-0001' }))).resolves.toHaveLength(0);
  });
  it('rejects malformed references and internal participant fields', async () => {
    expect(await validate(plainToInstance(CreateCareRequestDto, { ...input, participantPatientReference: 'internal' }))).not.toHaveLength(0);
    const errors = await validate(plainToInstance(CreateCareRequestDto, { ...input, patientId: 'internal', userId: 'spoof' }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['patientId', 'userId']));
  });
});
