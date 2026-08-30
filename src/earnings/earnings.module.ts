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
import { ProviderPayoutAccount } from "./entities/provider-payout-account.entity";
import { ProviderPayoutAccountHistory } from "./entities/provider-payout-account-history.entity";
import { AdminProviderPayoutAccountsController, ProviderPayoutAccountsController } from "./provider-payout-accounts.controller";
import { ProviderPayoutAccountsService } from "./provider-payout-accounts.service";
import { ProviderPayoutAccountCryptoService } from "./provider-payout-account-crypto.service";

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
      ProviderPayoutAccount,
      ProviderPayoutAccountHistory,
      User,
    ]),
  ],
  controllers: [ProviderEarningsController, AdminProviderEarningsController, ProviderPayoutsController, AdminProviderPayoutsController, ProviderPayoutAccountsController, AdminProviderPayoutAccountsController],
  providers: [ProviderEarningsService, ProviderPayoutsService, ProviderPayoutAccountsService, ProviderPayoutAccountCryptoService],
  exports: [ProviderEarningsService, ProviderPayoutsService, ProviderPayoutAccountsService],
})
export class EarningsModule {}
