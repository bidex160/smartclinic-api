# SmartClinic API Engineering Guide

## Repository scope

This repository contains only the SmartClinic Health Platform backend API. The web frontend is maintained separately in `smartclinic-web`; do not create a monorepo, add frontend code here, or modify that repository from this project.

## Technology baseline

- NestJS 11 with TypeScript
- PostgreSQL with TypeORM
- REST API documented with Swagger/OpenAPI
- `class-validator` and `class-transformer` for external input handling

Do not introduce dependencies without a clear, current product or engineering need.

## Architecture

Organise the application by domain module. The initial domains are authentication, users, patients, providers, health checks, bookings, payments, sponsorships, organisations, and notifications.

- Controllers handle HTTP concerns only: routing, request/response mapping, status codes, and guards.
- Services own domain business logic and coordinate persistence or integrations.
- DTOs represent and validate API input/output boundaries; keep them separate from database entities.
- Entities represent persistence concerns and must not be exposed directly as the public API contract.
- Keep module boundaries explicit and dependencies directional. Avoid a shared catch-all module.
- Design payment integrations behind provider abstractions/adapters. Booking business logic must not depend on a named payment provider.

## Security and privacy

- Treat patient and health information as sensitive.
- Require authentication and role-based authorization where appropriate.
- Validate and transform all external input through DTOs.
- Minimise sensitive data returned in API responses and logs.
- Make significant access and state-changing actions auditable as the relevant features are implemented.
- Read secrets and configuration from environment variables; never commit secrets, credentials, or real patient data.
- Do not claim regulatory or compliance certification unless it has actually been implemented and verified.

## Data and migrations

- Use PostgreSQL for persistent data.
- Use TypeORM migrations for production schema changes.
- Never enable TypeORM `synchronize` in production.
- Keep data models and migrations focused on the domain change being made.

## Quality and delivery

- Prefer simple, maintainable implementations over premature abstractions.
- Keep modules independently testable.
- Add tests for business-critical behaviour when implementing it.
- Do not implement speculative features, hardcode package pricing, or couple domains to a particular external provider.
- Do not commit, push, or alter repository history unless explicitly requested.
