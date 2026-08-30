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
import { ProviderPayout } from "./entities/provider-payout.entity";
import { ProviderPayoutEarning } from "./entities/provider-payout-earning.entity";
import { ProviderPayoutStatusHistory } from "./entities/provider-payout-status-history.entity";
import { AdminProviderPayoutsController, ProviderPayoutsController } from "./provider-payouts.controller";
import { ProviderPayoutsService } from "./provider-payouts.service";

@Module({
  imports: [
    AuthModule,
    CommissionsModule,
    TypeOrmModule.forFeature([
      Provider,
      ProviderEarning,
      ProviderEarningStatusHistory,
      ProviderPayout,
      ProviderPayoutEarning,
      ProviderPayoutStatusHistory,
      User,
    ]),
  ],
  controllers: [ProviderEarningsController, AdminProviderEarningsController, ProviderPayoutsController, AdminProviderPayoutsController],
  providers: [ProviderEarningsService, ProviderPayoutsService],
  exports: [ProviderEarningsService, ProviderPayoutsService],
})
export class EarningsModule {}
