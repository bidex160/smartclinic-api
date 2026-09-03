import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthCheckMeasurementCode } from '../enums/health-check-measurement-code.enum';

class PatientResultPackageDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class PatientResultProviderDto { @ApiProperty() displayName!: string; }
class PatientResultMeasurementDto {
  @ApiProperty({ enum: HealthCheckMeasurementCode, description: 'Canonical clinical content code; built-in values are shown in the enum.' }) code!: string;
  @ApiProperty() value!: number;
  @ApiPropertyOptional({ nullable: true }) secondaryValue!: number | null;
  @ApiProperty() unit!: string;
  @ApiProperty({ format: 'date-time' }) recordedAt!: Date;
}
export class HealthResultResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ format: 'date-time' }) completedAt!: Date;
  @ApiProperty({ type: PatientResultPackageDto }) healthCheckPackage!: PatientResultPackageDto;
  @ApiPropertyOptional({ type: PatientResultProviderDto, nullable: true }) provider!: PatientResultProviderDto | null;
  @ApiProperty({ type: PatientResultMeasurementDto, isArray: true }) measurements!: PatientResultMeasurementDto[];
}
