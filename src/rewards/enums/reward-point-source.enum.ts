/**
 * Where redeemed points come from.
 * REFERRAL points sit in the cash-backed ledger and can be withdrawn.
 * WELLNESS points are earned for healthy habits, can only reduce a Health Check, and are never cash.
 */
export enum RewardPointSource {
  REFERRAL = "REFERRAL",
  WELLNESS = "WELLNESS",
}
