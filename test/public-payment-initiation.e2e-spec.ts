import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { PublicBookingsController } from "../src/bookings/public-bookings.controller";
import { PublicBookingsService } from "../src/bookings/public-bookings.service";
import {
  PUBLIC_BOOKING_SESSION_COOKIE,
  PublicBookingSessionService,
} from "../src/bookings/public-booking-session.service";
import { PaymentFlowService } from "../src/payments/payment-flow.service";

describe("Public payment boundary (e2e)", () => {
  let app: INestApplication;
  const reference = "SC-2026-ABCDEF123456";
  const status = {
    bookingReference: reference,
    bookingStatus: "AWAITING_FUNDING",
    fundingStatus: "PENDING",
    checkoutOption: "PAY_NOW",
    paymentStatus: "PENDING_CONFIRMATION",
    paymentAttemptReference: "SC-PAY-safe",
    amount: "12500.00",
    currency: "NGN",
    paidAt: null,
  };

  beforeAll(async () => {
    const sessions = {
      resolveBooking: jest.fn(
        async (token: string | null, requestedReference: string) => {
          if (token !== "session" || requestedReference !== reference)
            throw new UnauthorizedException();
          return {};
        },
      ),
      cookieOptions: jest.fn(),
    };
    const payments = {
      initializeFunding: jest
        .fn()
        .mockImplementation((_reference, _actor, option = "PAY_NOW") =>
          Promise.resolve({
            bookingReference: reference,
            fundingStatus: "PENDING",
            checkoutOption: option,
            attemptId: null,
            attemptStatus: null,
            amount: "12500.00",
            currency: "NGN",
            paymentReference: null,
            checkoutUrl: null,
            accessCode: null,
          }),
        ),
      initiatePublicPayment: jest.fn().mockResolvedValue({
        bookingReference: reference,
        fundingStatus: "PENDING",
        checkoutOption: "PAY_NOW",
        attemptId: "internal-id",
        attemptStatus: "AWAITING_CUSTOMER_ACTION",
        amount: "12500.00",
        currency: "NGN",
        paymentReference: "SC-PAY-safe",
        checkoutUrl: "https://checkout.paystack.test/safe",
        accessCode: "popup-access-code",
      }),
      getPublicPaymentStatus: jest.fn().mockResolvedValue(status),
      verifyLatestBookingPayment: jest.fn().mockResolvedValue({
        ...status,
        bookingStatus: "PENDING_PROVIDER_MATCH",
        fundingStatus: "SETTLED",
        checkoutOption: "PAY_NOW",
        paymentStatus: "SUCCEEDED",
        paidAt: "2026-08-18T10:00:00.000Z",
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [PublicBookingsController],
      providers: [
        { provide: PublicBookingsService, useValue: {} },
        { provide: PublicBookingSessionService, useValue: sessions },
        { provide: PaymentFlowService, useValue: payments },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => app.close());
  const cookie = `${PUBLIC_BOOKING_SESSION_COOKIE}=session`;

  it("denies initiation without the booking session", () =>
    request(app.getHttpServer())
      .post(`/api/v1/public/bookings/${reference}/payment/initiate`)
      .expect(401));
  it("returns only safe checkout data for the controlled booking", () =>
    request(app.getHttpServer())
      .post(`/api/v1/public/bookings/${reference}/payment/initiate`)
      .set("Cookie", cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          bookingReference: reference,
          fundingStatus: "PENDING",
          checkoutOption: "PAY_NOW",
          paymentAttemptReference: "SC-PAY-safe",
          status: "AWAITING_CUSTOMER_ACTION",
          amount: "12500.00",
          currency: "NGN",
          checkoutUrl: "https://checkout.paystack.test/safe",
          accessCode: "popup-access-code",
        });
        expect(response.body).not.toHaveProperty("attemptId");
      }));
  it("returns a shareable hosted URL without Popup credentials for PAYMENT_LINK", () =>
    request(app.getHttpServer())
      .post(`/api/v1/public/bookings/${reference}/payment/initiate`)
      .set("Cookie", cookie)
      .send({ option: "PAYMENT_LINK" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          checkoutOption: "PAYMENT_LINK",
          checkoutUrl: "https://checkout.paystack.test/safe",
        });
        expect(response.body.accessCode).toBeNull();
        expect(response.body.fundingStatus).toBe("PENDING");
      }));
  it("keeps PAY_LATER outstanding without initializing Paystack", () =>
    request(app.getHttpServer())
      .post(`/api/v1/public/bookings/${reference}/payment/initiate`)
      .set("Cookie", cookie)
      .send({ option: "PAY_LATER" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          checkoutOption: "PAY_LATER",
          fundingStatus: "PENDING",
          paymentAttemptReference: null,
          status: null,
          checkoutUrl: null,
          accessCode: null,
        });
      }));
  it("denies status lookup without a session", () =>
    request(app.getHttpServer())
      .get(`/api/v1/public/bookings/${reference}/payment-status`)
      .expect(401));
  it("denies status lookup for a different booking", () =>
    request(app.getHttpServer())
      .get("/api/v1/public/bookings/SC-2026-111111111111/payment-status")
      .set("Cookie", cookie)
      .expect(401));
  it("returns only safe authoritative status for the controlled booking", () =>
    request(app.getHttpServer())
      .get(`/api/v1/public/bookings/${reference}/payment-status`)
      .set("Cookie", cookie)
      .expect(200)
      .expect(status));
  it("refreshes only the session-bound booking and returns the same contract", () =>
    request(app.getHttpServer())
      .post(`/api/v1/public/bookings/${reference}/payment-status/refresh`)
      .set("Cookie", cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.paymentStatus).toBe("SUCCEEDED");
        expect(response.body).not.toHaveProperty("attemptId");
        expect(response.body).not.toHaveProperty("providerCode");
      }));
});
