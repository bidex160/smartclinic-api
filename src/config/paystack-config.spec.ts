import "reflect-metadata";
import { validateEnvironment } from "./env.validation";
const base = {
  NODE_ENV: "production",
  PORT: 3000,
  DATABASE_HOST: "localhost",
  DATABASE_PORT: 5432,
  DATABASE_USERNAME: "postgres",
  DATABASE_PASSWORD: "",
  DATABASE_NAME: "smartclinic",
  FRONTEND_URL: "https://app.example.test",
  PROVIDER_INVITATION_FRONTEND_URL: "https://app.example.test/provider/setup",
  JWT_SECRET: "x".repeat(32),
  JWT_EXPIRES_IN: "15m",
  PROVIDER_OFFER_TTL_MINUTES: 30,
  PROVIDER_INVITATION_TTL: 604800,
  PUBLIC_BOOKING_SESSION_TTL: 604800,
  PAYMENT_PROVIDER: "paystack",
  EMAIL_PROVIDER: "none",
};
describe("Paystack production configuration", () => {
  it("fails closed without the secret key", () =>
    expect(() => validateEnvironment(base)).toThrow("PAYSTACK_SECRET_KEY"));
  it("accepts explicitly configured Paystack", () =>
    expect(
      validateEnvironment({
        ...base,
        PAYSTACK_SECRET_KEY: "sk_live_placeholder",
      }).PAYMENT_PROVIDER,
    ).toBe("paystack"));
  it("rejects the test adapter in production", () =>
    expect(() =>
      validateEnvironment({ ...base, PAYMENT_PROVIDER: "test" }),
    ).toThrow("not allowed"));
  it("accepts explicitly configured OPay only with its merchant credentials", () => {
    expect(() => validateEnvironment({ ...base, PAYMENT_PROVIDER: "opay" })).toThrow("OPAY_BASE_URL");
    expect(validateEnvironment({ ...base, PAYMENT_PROVIDER: "opay", OPAY_BASE_URL: "https://api.opaycheckout.com", OPAY_MERCHANT_ID: "merchant", OPAY_PUBLIC_KEY: "public", OPAY_PRIVATE_KEY: "private" }).PAYMENT_PROVIDER).toBe("opay");
  });
});
