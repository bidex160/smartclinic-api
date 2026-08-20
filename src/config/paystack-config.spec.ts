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
});
