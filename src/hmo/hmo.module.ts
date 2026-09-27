import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PatientsModule } from "../patients/patients.module";
import { AuthModule } from "../auth/auth.module";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { Hmo } from "./entities/hmo.entity";
import { HmoPlan } from "./entities/hmo-plan.entity";
import { PatientHmoCoverage } from "./entities/patient-hmo-coverage.entity";
import { HmoCase } from "./entities/hmo-case.entity";
import { HmoAuthorization } from "./entities/hmo-authorization.entity";
import { HmoClaim } from "./entities/hmo-claim.entity";
import { HmoController } from "./hmo.controller";
import { HmoService } from "./hmo.service";
import { User } from "../users/entities/user.entity";
import { HmoEnrollmentLead } from "./entities/hmo-enrollment-lead.entity";
import { CareRequestFunding } from "../care-requests/entities/care-request-funding.entity";
import { ProvidersModule } from "../providers/providers.module";
@Module({
  imports: [
    AuthModule,
    PatientsModule,
    ProvidersModule,
    TypeOrmModule.forFeature([
      Hmo,
      HmoPlan,
      PatientHmoCoverage,
      HmoCase,
      HmoAuthorization,
      HmoClaim,
      HmoEnrollmentLead,
      CareRequest,
      CareRequestFunding,
      User,
    ]),
  ],
  controllers: [HmoController],
  providers: [HmoService],
  exports: [HmoService],
})
export class HmoModule {}
