import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";
import { RewardPointSource } from "../enums/reward-point-source.enum";
export class ApplyRewardPointsDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) points!: number;
  @ApiPropertyOptional({ enum: RewardPointSource, default: RewardPointSource.REFERRAL, description: "REFERRAL (cash-backed) or WELLNESS (healthy-habit points, Health Checks only)" })
  @IsOptional() @IsEnum(RewardPointSource) source?: RewardPointSource;
}
