import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';

import { BookingResponseDto } from './dto/booking-response.dto';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { PublicBookingsService } from './public-bookings.service';

@ApiTags('Public bookings')
@Controller('public/bookings')
export class PublicBookingsController {
  constructor(private readonly publicBookingsService: PublicBookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft booking without a registered SmartClinic account' })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({ description: 'The input or selected catalogue items are invalid.' })
  @ApiUnprocessableEntityResponse({ description: 'No current catalogue price is available for the selected package and fulfilment mode.' })
  @ApiConflictResponse({ description: 'A booking reference could not be generated.' })
  create(@Body() createPublicBookingDto: CreatePublicBookingDto): Promise<BookingResponseDto> {
    return this.publicBookingsService.create(createPublicBookingDto);
  }
}
