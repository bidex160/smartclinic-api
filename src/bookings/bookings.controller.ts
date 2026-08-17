import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';

import { BookingResponseDto } from './dto/booking-response.dto';
import { BookingReferenceParamsDto } from './dto/booking-reference-params.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft booking for one participant' })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({ description: 'The input or referenced booking records are invalid.' })
  @ApiUnprocessableEntityResponse({ description: 'No current catalogue price is available for the selected package and fulfilment mode.' })
  @ApiConflictResponse({ description: 'A booking reference could not be generated.' })
  create(@Body() createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    return this.bookingsService.create(createBookingDto);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Retrieve a booking by its public reference' })
  @ApiParam({ name: 'reference', example: 'SC-2026-7F23B0C9D1E4' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({ description: 'The booking reference format is invalid.' })
  @ApiNotFoundResponse({ description: 'No booking exists for the supplied reference.' })
  findByReference(@Param() { reference }: BookingReferenceParamsDto): Promise<BookingResponseDto> {
    return this.bookingsService.findByReference(reference);
  }
}
