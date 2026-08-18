import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsNumber, ValidateNested } from 'class-validator';

class SingleMeasurementValueDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) value!: number;
}

class BloodPressureValueDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) systolic!: number;
  @ApiProperty() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 }) diastolic!: number;
}

export class SaveHealthCheckMeasurementsDto {
  @ApiProperty({ type: BloodPressureValueDto }) @IsDefined() @ValidateNested() @Type(() => BloodPressureValueDto) bloodPressure!: BloodPressureValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) bloodGlucose!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) bmi!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) temperature!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) oxygenSaturation!: SingleMeasurementValueDto;
  @ApiProperty({ type: SingleMeasurementValueDto }) @IsDefined() @ValidateNested() @Type(() => SingleMeasurementValueDto) pulse!: SingleMeasurementValueDto;
}
