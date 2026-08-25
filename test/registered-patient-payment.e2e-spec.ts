import { INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { BookingsService } from '../src/bookings/bookings.service';
import { MeHealthCheckPaymentsController } from '../src/bookings/me-health-check-payments.controller';
import { PaymentFlowService } from '../src/payments/payment-flow.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Registered patient payment boundary (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-2026-ABCDEF123456';
  const bookings = { requireSelfBooking: jest.fn() };
  const payments = {
    initializeFunding: jest.fn().mockResolvedValue({ bookingReference: reference, fundingStatus: 'PENDING', checkoutOption: 'PAY_NOW', amount: '12500.00', currency: 'NGN' }),
    initiatePatientPayment: jest.fn().mockResolvedValue({ bookingReference: reference, fundingStatus: 'PENDING', checkoutOption: 'PAY_NOW', attemptStatus: 'AWAITING_CUSTOMER_ACTION', amount: '12500.00', currency: 'NGN', paymentReference: 'SC-PAY-safe', checkoutUrl: 'https://checkout.test/safe', accessCode: 'access' }),
    getPublicPaymentStatus: jest.fn().mockResolvedValue({ bookingReference: reference, bookingStatus: 'AWAITING_FUNDING', fundingStatus: 'PENDING', checkoutOption: 'PAY_NOW', paymentStatus: 'AWAITING_CUSTOMER_ACTION', paymentAttemptReference: 'SC-PAY-safe', amount: '12500.00', currency: 'NGN', paidAt: null }),
    verifyLatestBookingPayment: jest.fn().mockResolvedValue({ bookingReference: reference, bookingStatus: 'PENDING_PROVIDER_MATCH', fundingStatus: 'SETTLED', checkoutOption: 'PAY_NOW', paymentStatus: 'SUCCEEDED', paymentAttemptReference: 'SC-PAY-safe', amount: '12500.00', currency: 'NGN', paidAt: new Date().toISOString() }),
  };

  beforeAll(async () => {
    bookings.requireSelfBooking.mockImplementation((_user: unknown, requested: string) => {
      if (requested !== reference) throw new NotFoundException();
      return Promise.resolve({ bookingReference: requested });
    });
    const module = await Test.createTestingModule({
      controllers: [MeHealthCheckPaymentsController],
      providers: [RolesGuard, Reflector, { provide: BookingsService, useValue: bookings }, { provide: PaymentFlowService, useValue: payments }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new UnauthorizedException();
      req.user = { id: token === 'other' ? 'user-b' : 'user-a', roles: token === 'provider' ? [UserRole.PROVIDER] : [UserRole.USER] };
      return true;
    }}).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('requires authentication and USER authority', async () => {
    await request(app.getHttpServer()).post(`/api/v1/me/health-checks/${reference}/payment`).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/me/health-checks/${reference}/payment`).set('Authorization', 'Bearer provider').expect(403);
  });

  it('initializes only the authenticated patient-owned booking without client amount/currency', async () => {
    await request(app.getHttpServer()).post(`/api/v1/me/health-checks/${reference}/payment`).set('Authorization', 'Bearer user').send({ option: 'PAY_NOW' }).expect(200).expect((response) => {
      expect(response.body).toMatchObject({ bookingReference: reference, amount: '12500.00', currency: 'NGN', accessCode: 'access' });
      expect(response.body).not.toHaveProperty('attemptId');
    });
    expect(bookings.requireSelfBooking).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }), reference);
    expect(payments.initializeFunding).toHaveBeenCalledWith(reference, 'user-a', 'PAY_NOW');
  });

  it('rejects another patient reference with the narrow ownership response', () =>
    request(app.getHttpServer()).post('/api/v1/me/health-checks/SC-2026-111111111111/payment').set('Authorization', 'Bearer other').send({ option: 'PAY_NOW' }).expect(404));

  it('returns status and verifies using the stored attempt under the same ownership check', async () => {
    await request(app.getHttpServer()).get(`/api/v1/me/health-checks/${reference}/payment`).set('Authorization', 'Bearer user').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/me/health-checks/${reference}/payment/verify`).set('Authorization', 'Bearer user').expect(200).expect((response) => expect(response.body.paymentStatus).toBe('SUCCEEDED'));
    expect(payments.verifyLatestBookingPayment).toHaveBeenCalledWith(reference, 'user-a');
  });

  it('rejects client-controlled payment fields', () =>
    request(app.getHttpServer()).post(`/api/v1/me/health-checks/${reference}/payment`).set('Authorization', 'Bearer user').send({ option: 'PAY_NOW', amount: '0.01', currency: 'USD', providerReference: 'attacker' }).expect(400));
});
