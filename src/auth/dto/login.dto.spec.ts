import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

const valid = async (value: object) => (await validate(plainToInstance(LoginDto, value))).length === 0;

describe('LoginDto', () => {
  it.each([
    ' Patient@Example.com ',
    '08012345678',
    '2348012345678',
    '+2348012345678',
  ])('accepts supported identifier %s', async (identifier) => {
    await expect(valid({ identifier, password: 'password' })).resolves.toBe(true);
  });

  it.each(['not-an-identifier', '08012', '+234-abc', ''])('rejects malformed identifier %s', async (identifier) => {
    await expect(valid({ identifier, password: 'password' })).resolves.toBe(false);
  });

  it('temporarily accepts the legacy email field', async () => {
    await expect(valid({ email: 'Patient@Example.com', password: 'password' })).resolves.toBe(true);
  });
});
