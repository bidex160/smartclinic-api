import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectedHospitalDto {
  @ApiProperty() hospitalCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty() logo!: string;
  @ApiPropertyOptional({ nullable: true }) patientReference!: string | null;
  @ApiPropertyOptional({ nullable: true }) externalPatientReference!: string | null;
}

export class HospitalInvoiceItemDto {
  @ApiProperty() itemReference!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ nullable: true }) amount!: string | null;
  @ApiPropertyOptional({ nullable: true }) payable!: boolean | null;
}

export class HospitalInvoiceDto {
  @ApiProperty() hospital!: ConnectedHospitalDto;
  @ApiProperty() patient!: { displayName: string | null; externalReference: string };
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true }) date!: string | null;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true }) total!: string | null;
  @ApiPropertyOptional({ nullable: true }) outstanding!: string | null;
  @ApiProperty({ type: [HospitalInvoiceItemDto] }) items!: HospitalInvoiceItemDto[];
}
