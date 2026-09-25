import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Patient } from "../patients/entities/patient.entity";
import { Provider } from "../providers/entities/provider.entity";
import { ProviderService } from "../providers/entities/provider-service.entity";
import { AssistedMatchRequest } from "./entities/assisted-match-request.entity";
import { AssistedMatchingController } from "./assisted-matching.controller";
import { AssistedMatchingService } from "./assisted-matching.service";
import { User } from "../users/entities/user.entity";
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      AssistedMatchRequest,
      Patient,
      Provider,
      ProviderService,
      User,
    ]),
  ],
  controllers: [AssistedMatchingController],
  providers: [AssistedMatchingService],
})
export class AssistedMatchingModule {}
