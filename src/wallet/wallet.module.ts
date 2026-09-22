import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { PatientWallet } from "./entities/patient-wallet.entity";
import { PatientWalletEntry } from "./entities/patient-wallet-entry.entity";
import { PatientWalletController } from "./patient-wallet.controller";
import { PatientWalletService } from "./patient-wallet.service";
import { User } from "../users/entities/user.entity";
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([PatientWallet, PatientWalletEntry, User]),
  ],
  controllers: [PatientWalletController],
  providers: [PatientWalletService],
  exports: [PatientWalletService],
})
export class WalletModule {}
