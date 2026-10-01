import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClinicalOrdersService } from '../clinical-orders/clinical-orders.service';
import {
  CancelClinicalOrderDto,
  ClinicalOrderReferenceParamsDto,
  CreateDirectClinicalOrderDto,
  DirectClinicalOrderListQueryDto,
  DirectOrderPatientLookupQueryDto,
} from '../clinical-orders/dto/clinical-order.dto';
import { User } from '../users/entities/user.entity';
import { ApiKeyGuard } from './api-key.guard';

/**
 * For a facility's own system (EMR, lab or pharmacy software), authenticated
 * by API key. Everything here works as the facility's owner account, with the
 * same rules and privacy as the provider portal.
 */
@ApiTags('Integration API')
@ApiHeader({ name: 'Authorization', description: 'Bearer sck_…' })
@UseGuards(ApiKeyGuard)
@Controller('integrations')
export class IntegrationApiController {
  constructor(private readonly orders: ClinicalOrdersService) {}

  @Get('patients/:patientReference') @ApiOperation({ summary: 'Confirm a SmartClinic ID (first name and initial only)' })
  patient(@Req() r: { user: User }, @Param() p: DirectOrderPatientLookupQueryDto) {
    return this.orders.lookupDirectPatient(r.user, p.patientReference);
  }

  @Post('requests') @ApiOperation({ summary: 'Send a prescription, lab, imaging or referral request' })
  create(@Req() r: { user: User }, @Body() dto: CreateDirectClinicalOrderDto) {
    return this.orders.createDirect(r.user, dto);
  }

  @Get('requests') @ApiOperation({ summary: 'Requests this facility has sent, newest first' })
  list(@Req() r: { user: User }, @Query() q: DirectClinicalOrderListQueryDto) {
    return this.orders.listDirect(r.user, q);
  }

  @Get('requests/:reference') @ApiOperation({ summary: 'One request, with its status and any results' })
  get(@Req() r: { user: User }, @Param() p: ClinicalOrderReferenceParamsDto) {
    return this.orders.getProvider(r.user, p.reference);
  }

  @Post('requests/:reference/cancel') @HttpCode(HttpStatus.OK)
  cancel(@Req() r: { user: User }, @Param() p: ClinicalOrderReferenceParamsDto, @Body() dto: CancelClinicalOrderDto) {
    return this.orders.cancel(r.user, p.reference, dto);
  }
}
