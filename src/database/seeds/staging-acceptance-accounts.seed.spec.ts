import { DataSource } from 'typeorm';

import {
  seedStagingAcceptanceAccounts,
  STAGING_ACCEPTANCE_SEED_CONFIRMATION,
} from './staging-acceptance-accounts.seed';

describe('seedStagingAcceptanceAccounts', () => {
  const connection = { transaction: jest.fn() } as unknown as DataSource;
  const accounts = {
    PATIENT: { email: 'patient@example.test', password: 'patient-password-123' },
    DOCTOR: { email: 'doctor@example.test', password: 'doctor-password-123' },
    PHARMACY: { email: 'pharmacy@example.test', password: 'pharmacy-password-123' },
    LAB: { email: 'lab@example.test', password: 'laboratory-password-123' },
    RADIOLOGY: { email: 'radiology@example.test', password: 'radiology-password-123' },
  };

  beforeEach(() => jest.clearAllMocks());

  it('refuses to run without the staging-only confirmation', async () => {
    await expect(seedStagingAcceptanceAccounts(connection, { accounts })).rejects.toThrow('Refusing to seed acceptance accounts');
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('refuses to run when NODE_ENV is production even with confirmation', async () => {
    await expect(seedStagingAcceptanceAccounts(connection, {
      confirmation: STAGING_ACCEPTANCE_SEED_CONFIRMATION,
      nodeEnv: 'production',
      accounts,
    })).rejects.toThrow('NODE_ENV=production');
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('requires every acceptance identity and a strong password', async () => {
    await expect(seedStagingAcceptanceAccounts(connection, {
      confirmation: STAGING_ACCEPTANCE_SEED_CONFIRMATION,
      nodeEnv: 'staging',
      accounts: { ...accounts, PHARMACY: undefined },
    })).rejects.toThrow('STAGING_E2E_PHARMACY_EMAIL');
    await expect(seedStagingAcceptanceAccounts(connection, {
      confirmation: STAGING_ACCEPTANCE_SEED_CONFIRMATION,
      nodeEnv: 'staging',
      accounts: { ...accounts, LAB: { email: 'lab@example.test', password: 'lab1234' } },
    })).rejects.toThrow('at least 12 characters');
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('requires a unique email for each role', async () => {
    await expect(seedStagingAcceptanceAccounts(connection, {
      confirmation: STAGING_ACCEPTANCE_SEED_CONFIRMATION,
      nodeEnv: 'staging',
      accounts: { ...accounts, RADIOLOGY: { ...accounts.RADIOLOGY, email: accounts.LAB.email } },
    })).rejects.toThrow('unique email');
    expect(connection.transaction).not.toHaveBeenCalled();
  });
});
