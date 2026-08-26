import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { RewardWithdrawalStatus } from "../enums/reward-withdrawal-status.enum";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class CreateRewardWithdrawalDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) points!: number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) bankName!: string;
  @ApiProperty({ example: "0123456789" }) @Transform(trim) @Matches(/^\d{6,20}$/) accountNumber!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) accountName!: string;
}

export class WithdrawalReasonDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class MarkWithdrawalPaidDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) externalReference!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) adminNote?: string;
}

export class RewardWithdrawalQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional({ enum: RewardWithdrawalStatus }) @IsOptional() @IsEnum(RewardWithdrawalStatus) status?: RewardWithdrawalStatus;
}

export class AdminRewardWithdrawalQueryDto extends RewardWithdrawalQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) @IsString() @MaxLength(254) userEmail?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(32) reference?: string;
  @ApiPropertyOptional({ format: "date" }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) requestedFrom?: string;
  @ApiPropertyOptional({ format: "date" }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) requestedTo?: string;
}
