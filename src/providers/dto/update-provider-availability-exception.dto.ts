import { PartialType } from '@nestjs/swagger';
import { CreateProviderAvailabilityExceptionDto } from './create-provider-availability-exception.dto';
export class UpdateProviderAvailabilityExceptionDto extends PartialType(CreateProviderAvailabilityExceptionDto) {}
