import { ApiProperty } from '@nestjs/swagger';

class LinkedPatientSummaryDto {
  @ApiProperty() givenName!: string;
  @ApiProperty() familyName!: string;
}

export class PatientAccountLinkResponseDto {
  @ApiProperty({ example: true }) linked!: true;
  @ApiProperty({ type: LinkedPatientSummaryDto }) patient!: LinkedPatientSummaryDto;
}
