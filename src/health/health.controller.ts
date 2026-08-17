import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export interface HealthResponse {
  status: 'ok';
  service: 'smartclinic-api';
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Get API health status' })
  @ApiOkResponse({
    description: 'The API is running.',
    schema: {
      example: { status: 'ok', service: 'smartclinic-api' },
    },
  })
  getStatus(): HealthResponse {
    return { status: 'ok', service: 'smartclinic-api' };
  }
}
