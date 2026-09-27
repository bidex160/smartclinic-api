import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "../users/enums/user-role.enum";
import { User } from "../users/entities/user.entity";
import { HmoService } from "./hmo.service";
import {
  ConfirmDeliveredServicesDto,
  CreateHmoCaseDto,
  CreateHmoDto,
  CreateHmoPlanDto,
  DecideAuthorizationDto,
  RequestAuthorizationDto,
  UpsertCoverageDto,
  VerifyEligibilityDto,
  SubmitClaimDto,
  RecordClaimPaymentDto,
  ReconcileClaimDto,
  CreateHmoEnrollmentLeadDto,
  SelectEncounterHmoDto,
} from "./hmo.dto";
@ApiTags("HMO")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hmo")
export class HmoController {
  constructor(private s: HmoService) {}
  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  hmos() {
    return this.s.listHmos();
  }
  @Get("me/coverages/:patientReference") @Roles(UserRole.USER) mine(
    @Req() r: { user: User },
    @Param("patientReference") p: string,
  ) {
    return this.s.listMine(r.user.id, p);
  }
  @Post("me/coverages/:patientReference") @Roles(UserRole.USER) addMine(
    @Req() r: { user: User },
    @Param("patientReference") p: string,
    @Body() d: Omit<UpsertCoverageDto, "patientId">,
  ) {
    return this.s.addMine(r.user.id, p, d);
  }
  @Post("me/enrollment-leads/:patientReference")
  @Roles(UserRole.USER)
  enrollmentLead(
    @Req() r: { user: User },
    @Param("patientReference") patientReference: string,
    @Body() d: CreateHmoEnrollmentLeadDto,
  ) {
    return this.s.createEnrollmentLead(r.user.id, patientReference, d);
  }
  @Post("me/encounters/:reference/select")
  @Roles(UserRole.USER)
  selectEncounter(
    @Req() r: { user: User },
    @Param("reference") reference: string,
    @Body() d: SelectEncounterHmoDto,
  ) {
    return this.s.selectForEncounter(reference, d.coverageId, r.user.id);
  }
  @Get("me/encounters/:reference")
  @Roles(UserRole.USER)
  encounter(@Req() r: { user: User }, @Param("reference") reference: string) {
    return this.s.encounterStatus(reference, r.user.id);
  }
  @Post("me/encounters/:reference/self-pay")
  @Roles(UserRole.USER)
  selfPay(@Req() r: { user: User }, @Param("reference") reference: string) {
    return this.s.useSelfPay(reference, r.user.id);
  }
  @Post("admin") @Roles(UserRole.ADMIN, UserRole.OPERATIONS) create(
    @Body() d: CreateHmoDto,
  ) {
    return this.s.createHmo(d);
  }
  @Post("admin/plans") @Roles(UserRole.ADMIN, UserRole.OPERATIONS) plan(
    @Body() d: CreateHmoPlanDto,
  ) {
    return this.s.createPlan(d);
  }
  @Post("admin/coverages") @Roles(UserRole.ADMIN, UserRole.OPERATIONS) coverage(
    @Body() d: UpsertCoverageDto,
  ) {
    return this.s.addCoverage(d);
  }
  @Get("admin/coverages") @Roles(UserRole.ADMIN, UserRole.OPERATIONS) coverages(
    @Query("patientId") p: string,
  ) {
    return this.s.listCoverages(p);
  }
  @Get("admin/enrollment-leads")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  enrollmentLeads() {
    return this.s.listEnrollmentLeads();
  }
  @Post("admin/cases")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  hmoCase(@Req() r: { user: User }, @Body() d: CreateHmoCaseDto) {
    return this.s.createCase(d, r.user);
  }
  @Post("admin/cases/:reference/eligibility")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  verify(
    @Req() r: { user: User },
    @Param("reference") ref: string,
    @Body() d: VerifyEligibilityDto,
  ) {
    return this.s.verify(ref, d, r.user);
  }
  @Post("admin/cases/:reference/authorizations")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  auth(
    @Req() r: { user: User },
    @Param("reference") ref: string,
    @Body() d: RequestAuthorizationDto,
  ) {
    return this.s.requestAuthorization(ref, d, r.user);
  }
  @Post("admin/authorizations/:reference/decision")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  decide(@Param("reference") ref: string, @Body() d: DecideAuthorizationDto) {
    return this.s.decide(ref, d);
  }
  @Post("admin/authorizations/:reference/delivery")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  delivery(
    @Req() r: { user: User },
    @Param("reference") ref: string,
    @Body() d: ConfirmDeliveredServicesDto,
  ) {
    return this.s.confirmDelivery(ref, d, r.user);
  }
  @Post("admin/authorizations/:reference/claim")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  claim(@Req() r: { user: User }, @Param("reference") ref: string) {
    return this.s.generateClaim(ref, r.user);
  }
  @Post("admin/claims/:reference/submit")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER)
  submitClaim(
    @Req() r: { user: User },
    @Param("reference") ref: string,
    @Body() d: SubmitClaimDto,
  ) {
    return this.s.submitClaim(ref, d, r.user);
  }
  @Post("admin/claims/:reference/payment")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  claimPayment(
    @Param("reference") ref: string,
    @Body() d: RecordClaimPaymentDto,
  ) {
    return this.s.recordClaimPayment(ref, d);
  }
  @Post("admin/claims/:reference/reconcile")
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  reconcile(@Param("reference") ref: string, @Body() d: ReconcileClaimDto) {
    return this.s.reconcileClaim(ref, d);
  }
  @Get("admin/desk") @Roles(UserRole.ADMIN, UserRole.OPERATIONS) desk() {
    return this.s.desk();
  }
  @Get("admin/funnel") @Roles(UserRole.ADMIN, UserRole.OPERATIONS) funnel() {
    return this.s.funnel();
  }
}
