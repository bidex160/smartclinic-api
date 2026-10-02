export enum RewardBookingRedemptionStatus {
  RESERVED = "RESERVED",
  SETTLED = "SETTLED",
  RELEASED = "RELEASED",
  CANCELLED = "CANCELLED",
  /** The Health Check was paid, then cancelled: the points went back to the patient. */
  REFUNDED = "REFUNDED",
}
