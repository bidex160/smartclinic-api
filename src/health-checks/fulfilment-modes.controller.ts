import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FulfilmentModeResponseDto } from './dto/fulfilment-mode-response.dto';
import { FulfilmentModesService } from './fulfilment-modes.service';

@ApiTags('Fulfilment modes')
@Controller('fulfilment-modes')
export class FulfilmentModesController {
  constructor(private readonly fulfilmentModesService: FulfilmentModesService) {}

  @Get()
  @ApiOperation({ summary: 'List active fulfilment modes' })
  @ApiOkResponse({ type: FulfilmentModeResponseDto, isArray: true })
  findActive(): Promise<FulfilmentModeResponseDto[]> {
    return this.fulfilmentModesService.findActive();
  }
}
