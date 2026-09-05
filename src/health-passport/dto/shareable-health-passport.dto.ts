import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class SharedHealthPassportParamsDto {
  @ApiProperty({ example: 'SCP-AB12-CD34' })
  @Matches(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  patientReference!: string;
}

export class ShareableHealthPassportResponseDto {
  @ApiProperty({ type: Object }) patient!: Record<string, unknown>;
  @ApiProperty({ type: Object }) authorization!: Record<string, boolean>;
  @ApiProperty({ type: Object, isArray: true }) guidedSelfChecks!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true }) reportedHealthHistory!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true }) reportedMeasurements!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true }) healthChecks!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true }) clinicalRecords!: Record<string, unknown>[];
}
