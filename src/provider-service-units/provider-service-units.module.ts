import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderLocation } from "../providers/entities/provider-location.entity";
import { ProvidersModule } from "../providers/providers.module";
import { ProviderServiceUnit } from "./entities/provider-service-unit.entity";
import {
  AdminProviderServiceUnitsController,
  ProviderServiceUnitsController,
} from "./provider-service-units.controller";
import { ProviderServiceUnitsService } from "./provider-service-units.service";
import { AuthModule } from "src/auth/auth.module";
import { User } from "src/users/entities/user.entity";

@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    TypeOrmModule.forFeature([ProviderServiceUnit, ProviderLocation, User]),
  ],
  controllers: [
    ProviderServiceUnitsController,
    AdminProviderServiceUnitsController,
  ],
  providers: [ProviderServiceUnitsService],
  exports: [ProviderServiceUnitsService, TypeOrmModule],
})
export class ProviderServiceUnitsModule {}
