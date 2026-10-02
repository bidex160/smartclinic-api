import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Request, Response } from 'express';

import { ClinicalOrdersService } from '../../clinical-orders/clinical-orders.service';
import { CreateDirectClinicalOrderDto } from '../../clinical-orders/dto/clinical-order.dto';
import { ClinicalOrderType } from '../../clinical-orders/enums/clinical-order-type.enum';
import { CurrentProviderService } from '../../providers/current-provider.service';
import { User } from '../../users/entities/user.entity';
import { ApiKeyGuard } from '../api-key.guard';
import {
  capabilityStatement,
  diagnosticReportResource,
  directOrderFromMedicationRequests,
  directOrderFromServiceRequests,
  DirectOrderInput,
  FhirResource,
  groupBundleEntries,
  medicationRequestResources,
  operationOutcome,
  OrderView,
  organizationResource,
  patientResource,
  searchBundle,
  serviceRequestResource,
} from './fhir.mapper';

const FHIR_JSON = 'application/fhir+json; charset=utf-8';
const REFERENCE = /^SC-ORD-[A-Z0-9]{6,32}$/;
const SMARTCLINIC_ID = /^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Every FHIR error is an OperationOutcome with the matching HTTP status. */
@Catch()
export class FhirExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('FHIR');
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? (exception.getResponse() as any) : undefined;
    const raw = typeof body === 'string' ? body : body?.message;
    const messages = (Array.isArray(raw) ? raw : [raw ?? (status >= 500 ? 'Internal server error' : 'Request failed')]).map(String);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const code =
      status === 401 ? 'login' : status === 403 ? 'forbidden' : status === 404 ? 'not-found' : status === 409 ? 'conflict' : status >= 500 ? 'exception' : 'invalid';
    res.status(status).type(FHIR_JSON).send(operationOutcome('error', code, messages));
  }
}

/**
 * FHIR R4 for hospital, lab and pharmacy systems. A thin layer over the same
 * direct-order service as the portal, so consent and privacy rules hold.
 */
@ApiExcludeController()
@UseFilters(FhirExceptionFilter)
@Controller('fhir/r4')
export class FhirController {
  constructor(
    private readonly orders: ClinicalOrdersService,
    private readonly currentProvider: CurrentProviderService,
  ) {}

  @Get('metadata')
  @Header('Content-Type', FHIR_JSON)
  metadata(@Req() req: Request) {
    return capabilityStatement(baseUrl(req));
  }

  // ------------------------------------------------------------ Patient

  @UseGuards(ApiKeyGuard)
  @Get('Patient/:id')
  @Header('Content-Type', FHIR_JSON)
  async patient(@Req() r: { user: User }, @Param('id') id: string) {
    return patientResource(await this.orders.lookupDirectPatient(r.user, smartClinicId(id)));
  }

  @UseGuards(ApiKeyGuard)
  @Get('Patient')
  @Header('Content-Type', FHIR_JSON)
  async searchPatient(@Req() r: { user: User } & Request, @Query('identifier') identifier?: string) {
    const value = identifier?.split('|').pop();
    if (!value) throw new BadRequestException('Search patients by SmartClinic ID: Patient?identifier=https://smartclinicnetwork.com/fhir/sid/smartclinic-id|SCP-ABCD-1234');
    try {
      const found = await this.orders.lookupDirectPatient(r.user, smartClinicId(value));
      return searchBundle([patientResource(found)], 1, selfUrl(r));
    } catch (error) {
      if (error instanceof NotFoundException) return searchBundle([], 0, selfUrl(r));
      throw error;
    }
  }

  // ------------------------------------------------------------ Organization

  @UseGuards(ApiKeyGuard)
  @Get('Organization/:id')
  @Header('Content-Type', FHIR_JSON)
  async organization(@Req() r: { user: User }, @Param('id') id: string) {
    // A key can read its own facility; other facilities appear by name on the requests they take part in.
    const { provider } = await this.currentProvider.resolveActor(r.user);
    if (provider.providerReference !== id) throw new NotFoundException(`Organization/${id} was not found`);
    return organizationResource(provider);
  }

  // ------------------------------------------------------------ ServiceRequest

  @UseGuards(ApiKeyGuard)
  @Post('ServiceRequest')
  @HttpCode(HttpStatus.CREATED)
  async createServiceRequest(@Req() r: { user: User } & Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, any>) {
    expectType(body, 'ServiceRequest');
    const created = await this.create(r.user, directOrderFromServiceRequests([body]));
    res.type(FHIR_JSON).location(`${baseUrl(r)}/ServiceRequest/${created.reference}`);
    return serviceRequestResource(created);
  }

  @UseGuards(ApiKeyGuard)
  @Get('ServiceRequest/:id')
  @Header('Content-Type', FHIR_JSON)
  async serviceRequest(@Req() r: { user: User }, @Param('id') id: string) {
    const order = await this.read(r.user, id);
    if (order.type === ClinicalOrderType.PRESCRIPTION) throw new NotFoundException(`ServiceRequest/${id} was not found; it is a prescription (MedicationRequest)`);
    return serviceRequestResource(order);
  }

  @UseGuards(ApiKeyGuard)
  @Get('ServiceRequest')
  @Header('Content-Type', FHIR_JSON)
  async searchServiceRequests(@Req() r: { user: User } & Request, @Query('_count') count?: string, @Query('_page') page?: string) {
    const { items, pageNo, limit, totalPages } = await this.page(r.user, count, page);
    const resources = items.filter((o) => o.type !== ClinicalOrderType.PRESCRIPTION).map(serviceRequestResource);
    return searchBundle(resources, resources.length, selfUrl(r), pageNo < totalPages ? nextUrl(r, pageNo + 1, limit) : undefined);
  }

  @UseGuards(ApiKeyGuard)
  @Post(['ServiceRequest/:id/:operation', 'MedicationRequest/:id/:operation'])
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', FHIR_JSON)
  async cancel(@Req() r: { user: User }, @Param('id') id: string, @Param('operation') operation: string, @Body() body: Record<string, any>) {
    if (operation !== '$cancel') throw new NotFoundException(`Operation ${operation} is not supported; use $cancel`);
    const reason = Array.isArray(body?.parameter) ? body.parameter.find((p: any) => p?.name === 'reason')?.valueString : undefined;
    await this.orders.cancel(r.user, orderReference(id), { reason: typeof reason === 'string' ? reason.slice(0, 1000) : undefined });
    return operationOutcome('information', 'informational', [`${orderReference(id)} was cancelled`]);
  }

  // ------------------------------------------------------------ MedicationRequest

  @UseGuards(ApiKeyGuard)
  @Post('MedicationRequest')
  @HttpCode(HttpStatus.CREATED)
  async createMedicationRequest(@Req() r: { user: User } & Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, any>) {
    expectType(body, 'MedicationRequest');
    const created = await this.create(r.user, directOrderFromMedicationRequests([body]));
    const [first] = medicationRequestResources(created);
    res.type(FHIR_JSON).location(`${baseUrl(r)}/MedicationRequest/${first.id}`);
    return first;
  }

  @UseGuards(ApiKeyGuard)
  @Get('MedicationRequest/:id')
  @Header('Content-Type', FHIR_JSON)
  async medicationRequest(@Req() r: { user: User }, @Param('id') id: string) {
    const match = /^(SC-ORD-[A-Z0-9]{6,32})-(\d{1,2})$/.exec(id);
    if (!match) throw new NotFoundException(`MedicationRequest/${id} was not found`);
    const order = await this.read(r.user, match[1]);
    if (order.type !== ClinicalOrderType.PRESCRIPTION) throw new NotFoundException(`MedicationRequest/${id} was not found`);
    const resource = medicationRequestResources(order)[Number(match[2]) - 1];
    if (!resource) throw new NotFoundException(`MedicationRequest/${id} was not found`);
    return resource;
  }

  @UseGuards(ApiKeyGuard)
  @Get('MedicationRequest')
  @Header('Content-Type', FHIR_JSON)
  async searchMedicationRequests(
    @Req() r: { user: User } & Request,
    @Query('group-identifier') group?: string,
    @Query('_count') count?: string,
    @Query('_page') page?: string,
  ) {
    if (group) {
      const order = await this.read(r.user, group.split('|').pop() ?? '');
      const resources = order.type === ClinicalOrderType.PRESCRIPTION ? medicationRequestResources(order) : [];
      return searchBundle(resources, resources.length, selfUrl(r));
    }
    const { items, pageNo, limit, totalPages } = await this.page(r.user, count, page);
    const resources = items.filter((o) => o.type === ClinicalOrderType.PRESCRIPTION).flatMap(medicationRequestResources);
    return searchBundle(resources, resources.length, selfUrl(r), pageNo < totalPages ? nextUrl(r, pageNo + 1, limit) : undefined);
  }

  // ------------------------------------------------------------ DiagnosticReport

  @UseGuards(ApiKeyGuard)
  @Get('DiagnosticReport/:id')
  @Header('Content-Type', FHIR_JSON)
  async diagnosticReport(@Req() r: { user: User }, @Param('id') id: string) {
    return diagnosticReportResource(await this.read(r.user, id));
  }

  @UseGuards(ApiKeyGuard)
  @Get('DiagnosticReport')
  @Header('Content-Type', FHIR_JSON)
  async searchDiagnosticReports(@Req() r: { user: User } & Request, @Query('based-on') basedOn?: string) {
    const ref = basedOn?.replace(/^ServiceRequest\//, '');
    if (!ref) throw new BadRequestException('Search reports by request: DiagnosticReport?based-on=ServiceRequest/SC-ORD-…');
    const order = await this.read(r.user, ref);
    const resources = order.type === ClinicalOrderType.LABORATORY || order.type === ClinicalOrderType.IMAGING ? [diagnosticReportResource(order)] : [];
    return searchBundle(resources, resources.length, selfUrl(r));
  }

  // ------------------------------------------------------------ Bundle (batch / transaction)

  @UseGuards(ApiKeyGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', FHIR_JSON)
  async bundle(@Req() r: { user: User } & Request, @Body() body: Record<string, any>) {
    const groups = groupBundleEntries(body);
    // Build and check every request first, so a bad entry stops the Bundle before anything is sent to a patient.
    const inputs = groups.map((g) => (g.kind === 'ServiceRequest' ? directOrderFromServiceRequests(g.resources) : directOrderFromMedicationRequests(g.resources)));
    await Promise.all(inputs.map(checked));
    const responses: Record<string, unknown>[] = new Array(body.entry.length);
    for (const [index, group] of groups.entries()) {
      const created = await this.orders.createDirect(r.user, inputs[index] as CreateDirectClinicalOrderDto) as unknown as OrderView;
      const resources: FhirResource[] = group.kind === 'ServiceRequest' ? [serviceRequestResource(created)] : medicationRequestResources(created);
      group.entries.forEach((entryIndex, position) => {
        const resource = resources[Math.min(position, resources.length - 1)];
        responses[entryIndex] = { resource, response: { status: '201 Created', location: `${resource.resourceType}/${resource.id}` } };
      });
    }
    return { resourceType: 'Bundle', type: body.type === 'transaction' ? 'transaction-response' : 'batch-response', entry: responses };
  }

  // ------------------------------------------------------------ helpers

  private async create(user: User, input: DirectOrderInput): Promise<OrderView> {
    return (await this.orders.createDirect(user, await checked(input))) as unknown as OrderView;
  }

  private async read(user: User, id: string): Promise<OrderView> {
    return (await this.orders.getProvider(user, orderReference(id))) as unknown as OrderView;
  }

  private async page(user: User, count?: string, page?: string) {
    const limit = clamp(Number(count) || 20, 1, 100);
    const pageNo = clamp(Number(page) || 1, 1, 10_000);
    const result = (await this.orders.listDirect(user, { page: pageNo, limit })) as { items: OrderView[]; totalPages: number };
    return { items: result.items, pageNo, limit, totalPages: result.totalPages };
  }
}

/** Runs the same validation as the REST API, so limits and required fields match. */
async function checked(input: DirectOrderInput): Promise<CreateDirectClinicalOrderDto> {
  const dto = plainToInstance(CreateDirectClinicalOrderDto, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    const messages = errors.flatMap(function flatten(e): string[] {
      return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flatten)];
    });
    throw new BadRequestException(messages);
  }
  return dto;
}

function expectType(body: Record<string, any>, type: string) {
  if (body?.resourceType !== type) throw new BadRequestException(`Send a ${type} resource (resourceType "${type}")`);
}
function smartClinicId(id: string) {
  const value = id.trim().toUpperCase();
  if (!SMARTCLINIC_ID.test(value)) throw new NotFoundException(`Patient/${id} was not found`);
  return value;
}
function orderReference(id: string) {
  const value = id.trim().toUpperCase();
  if (!REFERENCE.test(value)) throw new NotFoundException(`${id} was not found`);
  return value;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(n)));
function origin(req: Request) {
  const proto = (req.headers?.['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol ?? 'https';
  return `${proto}://${req.get?.('host') ?? 'localhost'}`;
}
function baseUrl(req: Request) {
  return `${origin(req)}/api/v1/fhir/r4`;
}
function selfUrl(req: Request) {
  return `${origin(req)}${req.originalUrl ?? ''}`;
}
function nextUrl(req: Request, page: number, limit: number) {
  const url = new URL(selfUrl(req));
  url.searchParams.set('_page', String(page));
  url.searchParams.set('_count', String(limit));
  return url.toString();
}
