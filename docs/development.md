# Development Guide

## Prerequisites

- Node.js 20 or later and npm.
- PostgreSQL 14 or later running locally.

## Local PostgreSQL setup

Create a local development database and use a local PostgreSQL account with permission to create and migrate it. For a default local PostgreSQL installation, the following is one option:

```sql
CREATE DATABASE smartclinic;
```

The API does not create production schema automatically. Apply migrations explicitly as they are added.

## Environment setup

Copy the example environment file and adjust values for your local PostgreSQL installation:

```bash
cp .env.example .env
```

The default values are:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=
DATABASE_NAME=smartclinic
FRONTEND_URL=http://localhost:4200
```

`TYPEORM_SYNCHRONIZE` defaults to `false`. Keep it false for normal development and always use migrations for durable schema changes. If it is temporarily set to `true`, it works only when `NODE_ENV=development`; it cannot enable TypeORM synchronisation in production.

## Install and run

```bash
npm install
npm run start:dev
```

The API listens on `http://localhost:3000` by default.

- Health endpoint: `http://localhost:3000/api/v1/health`
- Swagger UI: `http://localhost:3000/api/docs`

For a production-style local build:

```bash
npm run build
npm run start:prod
```

## Migrations

The migration CLI uses `src/database/data-source.ts`, independent of the running Nest application. Domain migrations are applied explicitly; application startup never runs them automatically.

Generate a migration after an approved entity/schema change:

```bash
npm run migration:generate -- src/database/migrations/DescriptiveMigrationName
```

Run pending migrations:

```bash
npm run migration:run
```

Revert the most recently applied migration:

```bash
npm run migration:revert
```

These commands require the configured PostgreSQL database to be available.

## Catalogue seed data

After applying migrations, seed the initial catalogue independently from application startup:

```bash
npm run seed
```

The seed inserts or updates the `ESSENTIAL` and `COMPLETE` Health Check package
metadata and inserts the `PROVIDER_LOCATION` and `HOME_VISIT` fulfilment modes.
It uses stable machine-readable `code` values and is safe to run repeatedly.
It does not create package-price rows: approved amount, currency, and effective
date values are required before prices can be added.

## Tests

```bash
npm run test
npm run test:e2e
```

Automated tests set `NODE_ENV=test` and disable the TypeORM connection so bootstrap and health-endpoint coverage do not require a local PostgreSQL server. This test-only behaviour does not affect normal development startup.


## Staging migration pre-deploy gate

Before changing migration filenames/timestamps or running `npm run migration:run` against staging, inspect the TypeORM migration history on the target PostgreSQL database.

Run:

```sql
SELECT id, timestamp, name
FROM migrations
WHERE timestamp IN (1792512000000, 1796486400000)
   OR name IN (
     'AddBasicHealthCheckTier1792512000000',
     'HealthCheckConfigurationQuotes1792512000000',
     'AssistedMatchingAndTravelPricing1796486400000',
     'ProviderAffiliationGovernance1796486400000'
   )
ORDER BY timestamp, id;
```

Expected review set:

- `AddBasicHealthCheckTier1792512000000`
- `HealthCheckConfigurationQuotes1792512000000`
- `AssistedMatchingAndTravelPricing1796486400000`
- `ProviderAffiliationGovernance1796486400000`

Do not rename either duplicate-timestamp migration until this query has been run against the actual staging database. If any listed migration is already recorded, preserve its recorded migration identity and reconcile history before assigning a new timestamp. If neither migration in a duplicate pair has been applied, assign a unique later timestamp only after confirming migration dependency order.

After the history is reconciled, run `npm run migration:run`, then `npm run seed`, and retain the migration output as deployment evidence.
