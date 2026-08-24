import { OmitType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';

export class CreateSelfBookingDto extends OmitType(CreateBookingDto, ['bookerUserId', 'participantPatientId', 'organisationContextId'] as const) {}
