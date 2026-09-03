import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsNumber, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

class SingleMeasurementValueDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) value!: number;
}

class BloodPressureValueDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) systolic!: number;
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) diastolic!: number;
}

export class AdditionalHealthCheckResultDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) code!: string;
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) value!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) secondaryValue?: number;
}

export class SaveHealthCheckMeasurementsDto {
  @ApiProperty({ type: BloodPressureValueDto }) @IsDefined() @ValidateNested() @Type(() => BloodPressureValueDto) bloodPressure!: BloodPressureValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) bloodGlucose!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) bmi!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) temperature!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) oxygenSaturation!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) pulse!: SingleMeasurementValueDto;
  @ApiPropertyOptional({ type: AdditionalHealthCheckResultDto, isArray: true }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AdditionalHealthCheckResultDto) additionalResults?: AdditionalHealthCheckResultDto[];
}
