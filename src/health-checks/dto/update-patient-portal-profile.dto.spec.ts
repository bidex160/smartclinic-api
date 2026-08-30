import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdatePatientPortalProfileDto } from './update-patient-portal-profile.dto';

describe('UpdatePatientPortalProfileDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const transform = (value: object) => pipe.transform(value, { type: 'body', metatype: UpdatePatientPortalProfileDto });

  it('trims names and accepts valid partial phone and DOB updates', async () => {
    await expect(transform({ givenName: '  Ada  ', phone: '+234 801 234 5678', dateOfBirth: '1990-01-01' })).resolves.toEqual({ givenName: 'Ada', phone: '+234 801 234 5678', dateOfBirth: '1990-01-01' });
  });

  it.each([{ givenName: '   ' }, { familyName: '' }, { givenName: null }, { familyName: null }, { phone: 'invalid' }, { dateOfBirth: 'not-a-date' }])('rejects invalid profile input %#', async (input) => {
    await expect(transform(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([{ email: 'other@example.test' }, { patientReference: 'SCP-EVIL-0000' }, { userId: 'another-user' }, { id: 'another-patient' }])('forbids ownership and account identity fields %#', async (input) => {
    await expect(transform(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows nullable optional fields to be explicitly cleared', async () => {
    await expect(transform({ phone: null, dateOfBirth: null })).resolves.toEqual({ phone: null, dateOfBirth: null });
  });
});
