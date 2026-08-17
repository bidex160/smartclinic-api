import { ApiProperty } from '@nestjs/swagger';

import { FulfilmentMode } from '../entities/fulfilment-mode.entity';

export class FulfilmentModeResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Identifier required by the current booking-create request.' })
  id!: string;

  @ApiProperty({ example: 'PROVIDER_LOCATION' })
  code!: string;

  @ApiProperty({ example: 'Provider location' })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  static fromEntity(fulfilmentMode: FulfilmentMode): FulfilmentModeResponseDto {
    return {
      id: fulfilmentMode.id,
      code: fulfilmentMode.code,
      name: fulfilmentMode.name,
      isActive: fulfilmentMode.isActive,
    };
  }
}
