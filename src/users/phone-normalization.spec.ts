import { normalizePhoneNumber } from './phone-normalization';

describe('normalizePhoneNumber', () => {
  it.each(['08012345678', '2348012345678', '+2348012345678', '+234 801 234 5678'])(
    'canonicalizes %s',
    (value) => expect(normalizePhoneNumber(value)).toBe('+2348012345678'),
  );

  it.each(['08012', '+234-abc', '++2348012345678', ''])('rejects malformed %s', (value) => {
    expect(normalizePhoneNumber(value)).toBeNull();
  });
});
