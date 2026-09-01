import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('User phone login identity migration', () => {
  const source = readFileSync(
    join(__dirname, 'migrations/1793116800000-UserPhoneLoginIdentity.ts'),
    'utf8',
  );

  it('creates an indexed nullable User identity and backfills only unambiguous phones', () => {
    expect(source).toContain('ADD "phone_normalized" varchar');
    expect(source).toContain('HAVING COUNT(*) = 1');
    expect(source).toContain('CREATE UNIQUE INDEX "UQ_users_phone_normalized"');
    expect(source).toContain('WHERE "phone_normalized" IS NOT NULL');
  });
});
