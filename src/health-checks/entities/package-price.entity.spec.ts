import { getMetadataArgsStorage } from 'typeorm';

import { PackagePrice } from './package-price.entity';

describe('PackagePrice entity metadata', () => {
  it('uses fixed-precision money and an ISO 4217 currency database constraint', () => {
    const storage = getMetadataArgsStorage();
    const amount = storage.columns.find(
      (column) => column.target === PackagePrice && column.propertyName === 'amount',
    );
    const currency = storage.columns.find(
      (column) => column.target === PackagePrice && column.propertyName === 'currency',
    );
    const currencyCheck = storage.checks.find(
      (check) => check.target === PackagePrice && check.name === 'CHK_package_prices_currency_format',
    );

    expect(amount).toMatchObject({ options: { type: 'numeric', precision: 12, scale: 2 } });
    expect(currency).toMatchObject({ options: { type: 'char', length: 3 } });
    expect(currencyCheck).toMatchObject({ expression: '"currency" ~ \'^[A-Z]{3}$\'' });
  });
});
