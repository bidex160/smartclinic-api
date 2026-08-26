import { ApiProperty } from '@nestjs/swagger';

class AdminDashboardBookingsDto {
  @ApiProperty({ minimum: 0 }) awaitingFunding!: number;
  @ApiProperty({ minimum: 0 }) pendingProviderMatch!: number;
  @ApiProperty({ minimum: 0 }) scheduled!: number;
  @ApiProperty({ minimum: 0 }) inProgress!: number;
  @ApiProperty({ minimum: 0 }) completed!: number;
  @ApiProperty({ minimum: 0 }) needsAttention!: number;
}

class AdminDashboardMatchingDto {
  @ApiProperty({ minimum: 0 }) activeOffers!: number;
}

class AdminDashboardProvidersDto {
  @ApiProperty({ minimum: 0 }) pendingReview!: number;
  @ApiProperty({ minimum: 0 }) active!: number;
}

class AdminDashboardReferralsDto {
  @ApiProperty() registered!: number;
  @ApiProperty() qualified!: number;
  @ApiProperty() level1Achieved!: number;
  @ApiProperty() pointsIssued!: number;
}

export class AdminDashboardSummaryDto {
  @ApiProperty({ type: AdminDashboardBookingsDto }) bookings!: AdminDashboardBookingsDto;
  @ApiProperty({ type: AdminDashboardMatchingDto }) matching!: AdminDashboardMatchingDto;
  @ApiProperty({ type: AdminDashboardProvidersDto }) providers!: AdminDashboardProvidersDto;
  @ApiProperty({ type: AdminDashboardReferralsDto }) referrals!: AdminDashboardReferralsDto;
}
