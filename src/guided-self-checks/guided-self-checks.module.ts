import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { GuidedSelfCheck } from "./entities/guided-self-check.entity";
import { GuidedSelfCheckHistory } from "./entities/guided-self-check-history.entity";
import { GuidedSelfCheckProduct } from "./entities/guided-self-check-product.entity";
import {
  AdminGuidedSelfCheckController,
  GuidedSelfCheckProductController,
  MeGuidedSelfChecksController,
} from "./guided-self-checks.controller";
import { GuidedSelfChecksService } from "./guided-self-checks.service";
import { User } from "src/users/entities/user.entity";
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      GuidedSelfCheckProduct,
      GuidedSelfCheck,
      GuidedSelfCheckHistory,
      User,
    ]),
  ],
  controllers: [
    GuidedSelfCheckProductController,
    MeGuidedSelfChecksController,
    AdminGuidedSelfCheckController,
  ],
  providers: [GuidedSelfChecksService],
  exports: [GuidedSelfChecksService],
})
export class GuidedSelfChecksModule {}
