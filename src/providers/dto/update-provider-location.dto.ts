import { PartialType } from '@nestjs/swagger';
import { CreateProviderLocationDto } from './create-provider-location.dto';
export class UpdateProviderLocationDto extends PartialType(CreateProviderLocationDto) {}
