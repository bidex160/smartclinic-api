import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { GuidedSelfCheckAnswer } from "./entities/guided-self-check-answer.entity";
import { GuidedSelfCheckHistory } from "./entities/guided-self-check-history.entity";
import { GuidedSelfCheckProduct } from "./entities/guided-self-check-product.entity";
import { GuidedSelfCheckQuestionGroup } from "./entities/guided-self-check-question-group.entity";
import { GuidedSelfCheckQuestion } from "./entities/guided-self-check-question.entity";
import { GuidedSelfCheckQuestionnaireVersion } from "./entities/guided-self-check-questionnaire-version.entity";
import { GuidedSelfCheck } from "./entities/guided-self-check.entity";
import {
  AdminGuidedSelfCheckController,
  GuidedSelfCheckProductController,
  MeGuidedSelfChecksController,
} from "./guided-self-checks.controller";
import { GuidedSelfCheckQuestionnairesService } from "./guided-self-check-questionnaires.service";
import { GuidedSelfChecksService } from "./guided-self-checks.service";
import { User } from "src/users/entities/user.entity";
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      GuidedSelfCheckProduct,
      GuidedSelfCheck,
      GuidedSelfCheckHistory,
      GuidedSelfCheckQuestionnaireVersion,
      GuidedSelfCheckQuestionGroup,
      GuidedSelfCheckQuestion,
      GuidedSelfCheckAnswer,
      User,
    ]),
  ],
  controllers: [
    GuidedSelfCheckProductController,
    MeGuidedSelfChecksController,
    AdminGuidedSelfCheckController,
  ],
  providers: [GuidedSelfChecksService, GuidedSelfCheckQuestionnairesService],
  exports: [GuidedSelfChecksService],
})
export class GuidedSelfChecksModule {}
