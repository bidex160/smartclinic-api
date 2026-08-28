import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CommissionsModule } from "../commissions/commissions.module";
import { Provider } from "../providers/entities/provider.entity";
import {
  AdminProviderEarningsController,
  ProviderEarningsController,
} from "./provider-earnings.controller";
import { ProviderEarningsService } from "./provider-earnings.service";
import { ProviderEarning } from "./entities/provider-earning.entity";
import { ProviderEarningStatusHistory } from "./entities/provider-earning-status-history.entity";
import { User } from "src/users/entities/user.entity";

@Module({
  imports: [
    AuthModule,
    CommissionsModule,
    TypeOrmModule.forFeature([
      Provider,
      ProviderEarning,
      ProviderEarningStatusHistory,
      User,
    ]),
  ],
  controllers: [ProviderEarningsController, AdminProviderEarningsController],
  providers: [ProviderEarningsService],
  exports: [ProviderEarningsService],
})
export class EarningsModule {}
