export interface PharmacyCoordinationCalculation {
  doctorAmountMinor: bigint;
  hospitalAmountMinor: bigint;
  totalCoordinationFeeMinor: bigint;
  totalPayableMinor: bigint;
}

function cappedBpsAmount(basis: bigint, bps: number, cap: bigint): bigint {
  if (basis <= 0n || bps <= 0 || cap <= 0n) return 0n;
  const calculated = (basis * BigInt(bps)) / 10_000n;
  return calculated > cap ? cap : calculated;
}

export function calculatePharmacyCoordinationFees(
  medicineAmountMinor: bigint,
  input: {
    doctorBps: number;
    hospitalBps: number;
    doctorCapMinor: bigint;
    hospitalCapMinor: bigint;
    hospitalEligible: boolean;
  },
): PharmacyCoordinationCalculation {
  const doctorAmountMinor = cappedBpsAmount(
    medicineAmountMinor,
    input.doctorBps,
    input.doctorCapMinor,
  );
  const hospitalAmountMinor = input.hospitalEligible
    ? cappedBpsAmount(medicineAmountMinor, input.hospitalBps, input.hospitalCapMinor)
    : 0n;
  const totalCoordinationFeeMinor = doctorAmountMinor + hospitalAmountMinor;
  return {
    doctorAmountMinor,
    hospitalAmountMinor,
    totalCoordinationFeeMinor,
    totalPayableMinor: medicineAmountMinor + totalCoordinationFeeMinor,
  };
}
