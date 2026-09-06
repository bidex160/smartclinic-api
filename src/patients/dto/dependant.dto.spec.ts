import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDependantDto } from './dependant.dto';

describe('CreateDependantDto', () => {
  const valid = { firstName: ' Aisha ', lastName: ' Okafor ', dateOfBirth: '2015-06-12', relationshipType: 'MOTHER', countryCode: ' ng ', stateOrRegion: ' Lagos ', city: ' Ikeja ' };
  it('accepts and normalizes only dependant demographic input', async () => {
    const dto = plainToInstance(CreateDependantDto, valid); expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto).toMatchObject({ firstName: 'Aisha', lastName: 'Okafor', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' });
  });
  it.each(['userId', 'guardianUserId', 'createdByUserId', 'rewardRecipientUserId', 'email', 'phone', 'password', 'role', 'status'])('rejects client-controlled %s', async field => {
    const dto = plainToInstance(CreateDependantDto, { ...valid, [field]: 'spoofed' }); expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
});
