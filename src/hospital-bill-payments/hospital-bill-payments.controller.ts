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
import { CreateHospitalBillPaymentDto } from "./dto/create-hospital-bill-payment.dto";
import { HospitalBillPaymentsService } from "./hospital-bill-payments.service";

@ApiTags("My Hospital Bill Payments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/hospital-bill-payments")
export class HospitalBillPaymentsController {
  constructor(private readonly service: HospitalBillPaymentsService) {}
  @Get("hospitals") hospitals(@Req() request: { user: User }) {
    return this.service.connectedHospitals(request.user.id);
  }
  @Get(":hospitalCode/invoice") invoice(
    @Req() request: { user: User },
    @Param("hospitalCode") hospitalCode: string,
    @Query("invoiceReference") invoiceReference?: string,
  ) {
    return this.service.invoiceForPatient(request.user.id, hospitalCode, invoiceReference);
  }
  @Post() initialize(
    @Req() request: { user: User },
    @Body() dto: CreateHospitalBillPaymentDto,
  ) {
    return this.service.initialize(request.user.id, dto);
  }
  @Post(":reference/verify") verify(
    @Req() request: { user: User },
    @Param("reference") reference: string,
  ) {
    return this.service.verify(request.user.id, reference);
  }
}
