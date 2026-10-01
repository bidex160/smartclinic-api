import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import {
  PatientDailyRoutineSource,
  PatientDailyRoutineType,
} from "../enums/patient-daily-routine.enum";

export class CreatePatientDailyRoutineDto {
  @ApiProperty({ enum: PatientDailyRoutineType })
  @IsEnum(PatientDailyRoutineType)
  type!: PatientDailyRoutineType;
  @ApiProperty({ example: "Evening medicine" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string | null;
  @ApiProperty({ example: "19:00" })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  scheduledLocalTime!: string;
  @ApiProperty({ example: "Africa/Lagos" }) @IsTimeZone() timezone!: string;
  @ApiProperty({ type: [Number], example: [0, 1, 2, 3, 4, 5, 6] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];
  @ApiPropertyOptional({
    description: "Required when adding a personal medication reminder.",
  })
  @IsOptional()
  @IsBoolean()
  medicationSafetyAcknowledged?: boolean;
}

export class UpdatePatientDailyRoutineDto {
  @ApiPropertyOptional({ enum: PatientDailyRoutineType })
  @IsOptional()
  @IsEnum(PatientDailyRoutineType)
  type?: PatientDailyRoutineType;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  scheduledLocalTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsTimeZone() timezone?: string;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  medicationSafetyAcknowledged?: boolean;
}

export class PatientDailyRoutineDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: PatientDailyRoutineType })
  type!: PatientDailyRoutineType;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) instructions!: string | null;
  @ApiProperty() scheduledLocalTime!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: [Number] }) daysOfWeek!: number[];
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ enum: PatientDailyRoutineSource })
  source!: PatientDailyRoutineSource;
}

export class PatientDailyRoutineListDto {
  @ApiProperty({ type: [PatientDailyRoutineDto] })
  @ValidateNested({ each: true })
  @Type(() => PatientDailyRoutineDto)
  items!: PatientDailyRoutineDto[];
}

export class PatientTodayRoutineDto extends PatientDailyRoutineDto {
  @ApiProperty({ description: "Whether the patient ticked this routine today." })
  completedToday!: boolean;
}

export class DailyCheckInScoresDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: "1 = very low, 5 = great." })
  mood!: number;
  @ApiProperty({ minimum: 1, maximum: 5, nullable: true }) energy!: number | null;
  @ApiProperty({ minimum: 1, maximum: 5, nullable: true }) sleep!: number | null;
}

export class DailyCheckInDto extends DailyCheckInScoresDto {
  @ApiProperty({ example: "2026-10-01" }) localDate!: string;
}

export class DailyCheckInListDto {
  @ApiProperty({ type: [DailyCheckInDto] }) items!: DailyCheckInDto[];
}

export class UpsertDailyCheckInDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) mood!: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  energy?: number | null;
  @ApiPropertyOptional({ minimum: 1, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sleep?: number | null;
  @ApiProperty({ example: "Africa/Lagos" }) @IsTimeZone() timezone!: string;
}

export class DailyCareDayDto {
  @ApiProperty({ example: "2026-10-01" }) localDate!: string;
  @ApiProperty({ description: "A routine was ticked or a check-in was saved that day." })
  active!: boolean;
}

export class DailyCareProgressDto {
  @ApiProperty({ example: "2026-10-01", description: "Today in the patient's routine timezone." })
  localDate!: string;
  @ApiProperty({ type: [String], description: "Routine references ticked today." })
  completedReferences!: string[];
  @ApiProperty({
    description:
      "Consecutive active days (a routine ticked or a check-in saved), ending today or yesterday when today is not yet active. Self-reported.",
  })
  streakDays!: number;
  @ApiProperty({ description: "Longest run of consecutive active days in the last 400 days." })
  bestStreak!: number;
  @ApiProperty({ type: DailyCheckInScoresDto, nullable: true })
  todayCheckIn!: DailyCheckInScoresDto | null;
  @ApiProperty({ type: [DailyCareDayDto], description: "The last 7 local days, oldest first, ending today." })
  week!: DailyCareDayDto[];
}
