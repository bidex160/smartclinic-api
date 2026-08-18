import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class LinkPatientFromResultDto {
  @ApiProperty({ description: 'Opaque guest result-access token returned when the grant was issued.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  resultAccessToken!: string;
}
