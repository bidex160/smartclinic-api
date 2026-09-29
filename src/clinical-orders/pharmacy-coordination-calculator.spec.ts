import { calculatePharmacyCoordinationFees } from "./pharmacy-coordination-calculator";

describe("calculatePharmacyCoordinationFees", () => {
  it("adds transparent doctor and hospital fees without reducing medicine value", () => {
    expect(
      calculatePharmacyCoordinationFees(2_000_000n, {
        doctorBps: 300,
        hospitalBps: 300,
        doctorCapMinor: 100_000n,
        hospitalCapMinor: 100_000n,
        hospitalEligible: true,
      }),
    ).toEqual({
      doctorAmountMinor: 60_000n,
      hospitalAmountMinor: 60_000n,
      totalCoordinationFeeMinor: 120_000n,
      totalPayableMinor: 2_120_000n,
    });
  });

  it("uses integer-minor-unit floor rounding and applies caps", () => {
    expect(
      calculatePharmacyCoordinationFees(19_999n, {
        doctorBps: 300,
        hospitalBps: 300,
        doctorCapMinor: 100n,
        hospitalCapMinor: 50n,
        hospitalEligible: true,
      }),
    ).toMatchObject({
      doctorAmountMinor: 100n,
      hospitalAmountMinor: 50n,
      totalPayableMinor: 20_149n,
    });
  });

  it("does not create a hospital fee without an authoritative hospital relationship", () => {
    expect(
      calculatePharmacyCoordinationFees(500_000n, {
        doctorBps: 300,
        hospitalBps: 300,
        doctorCapMinor: 100_000n,
        hospitalCapMinor: 100_000n,
        hospitalEligible: false,
      }),
    ).toMatchObject({
      doctorAmountMinor: 15_000n,
      hospitalAmountMinor: 0n,
      totalPayableMinor: 515_000n,
    });
  });
});
