import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FulfilmentModeResponseDto } from './dto/fulfilment-mode-response.dto';
import { FulfilmentMode } from './entities/fulfilment-mode.entity';

@Injectable()
export class FulfilmentModesService {
  constructor(
    @InjectRepository(FulfilmentMode)
    private readonly fulfilmentModeRepository: Repository<FulfilmentMode>,
  ) {}

  async findActive(): Promise<FulfilmentModeResponseDto[]> {
    const fulfilmentModes = await this.fulfilmentModeRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    return fulfilmentModes.map(FulfilmentModeResponseDto.fromEntity);
  }
}
