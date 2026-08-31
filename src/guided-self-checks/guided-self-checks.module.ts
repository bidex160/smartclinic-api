import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { GuidedSelfCheckAnswer } from "./entities/guided-self-check-answer.entity";
import { GuidedSelfCheckClassificationResult } from "./entities/guided-self-check-classification.entity";
import { GuidedSelfCheckClinicalRuleset } from "./entities/guided-self-check-clinical-ruleset.entity";
import { GuidedSelfCheckHistory } from "./entities/guided-self-check-history.entity";
import { GuidedSelfCheckProduct } from "./entities/guided-self-check-product.entity";
import { GuidedSelfCheckQuestionGroup } from "./entities/guided-self-check-question-group.entity";
import { GuidedSelfCheckQuestion } from "./entities/guided-self-check-question.entity";
import { GuidedSelfCheckQuestionnaireVersion } from "./entities/guided-self-check-questionnaire-version.entity";
import { GuidedSelfCheck } from "./entities/guided-self-check.entity";
import {
  AdminGuidedSelfCheckClassificationsController,
  AdminGuidedSelfCheckController,
  GuidedSelfCheckProductController,
  MeGuidedSelfChecksController,
} from "./guided-self-checks.controller";
import { GuidedSelfCheckClassificationsService } from "./guided-self-check-classifications.service";
import { GuidedSelfCheckQuestionnairesService } from "./guided-self-check-questionnaires.service";
import { GuidedSelfChecksService } from "./guided-self-checks.service";
import { User } from "src/users/entities/user.entity";
import { ProvidersModule } from "../providers/providers.module";
import { Provider } from "../providers/entities/provider.entity";
import { GuidedSelfCheckProfessionalReview } from "./entities/guided-self-check-professional-review.entity";
import { GuidedSelfCheckProfessionalReviewHistory } from "./entities/guided-self-check-professional-review-history.entity";
import { GuidedSelfCheckProfessionalReviewsService } from "./guided-self-check-professional-reviews.service";
import { AdminGuidedSelfCheckReviewsController,ProviderGuidedSelfCheckReviewsController } from "./guided-self-check-reviews.controller";
import { GuidedSelfCheckReviewerAuthorization } from "./entities/guided-self-check-reviewer-authorization.entity";
import { GuidedSelfCheckReviewerAuthorizationHistory } from "./entities/guided-self-check-reviewer-authorization-history.entity";
import { GuidedSelfCheckReviewerAuthorizationsService } from "./guided-self-check-reviewer-authorizations.service";
import { GuidedSelfCheckReviewerDirectoryController,GuidedSelfCheckReviewerGovernanceController } from "./guided-self-check-reviewer-authorizations.controller";
import { GuidedSelfCheckNextAction } from "./entities/guided-self-check-next-action.entity";
import { GuidedSelfCheckNextActionsService } from "./guided-self-check-next-actions.service";
import { HealthCheckPackage } from "../health-checks/entities/health-check-package.entity";
@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    TypeOrmModule.forFeature([
      GuidedSelfCheckProduct,
      GuidedSelfCheck,
      GuidedSelfCheckHistory,
      GuidedSelfCheckQuestionnaireVersion,
      GuidedSelfCheckQuestionGroup,
      GuidedSelfCheckQuestion,
      GuidedSelfCheckAnswer,
      GuidedSelfCheckClinicalRuleset,
      GuidedSelfCheckClassificationResult,
      User,
      Provider,
      GuidedSelfCheckProfessionalReview,
      GuidedSelfCheckProfessionalReviewHistory,
      GuidedSelfCheckReviewerAuthorization,
      GuidedSelfCheckReviewerAuthorizationHistory,
      GuidedSelfCheckNextAction,
      HealthCheckPackage,
    ]),
  ],
  controllers: [
    GuidedSelfCheckProductController,
    MeGuidedSelfChecksController,
    AdminGuidedSelfCheckController,
    AdminGuidedSelfCheckClassificationsController,
    AdminGuidedSelfCheckReviewsController,
    ProviderGuidedSelfCheckReviewsController,
    GuidedSelfCheckReviewerDirectoryController,
    GuidedSelfCheckReviewerGovernanceController,
  ],
  providers: [
    GuidedSelfChecksService,
    GuidedSelfCheckQuestionnairesService,
    GuidedSelfCheckClassificationsService,
    GuidedSelfCheckProfessionalReviewsService,
    GuidedSelfCheckReviewerAuthorizationsService,
    GuidedSelfCheckNextActionsService,
  ],
  exports: [GuidedSelfChecksService, GuidedSelfCheckNextActionsService],
})
export class GuidedSelfChecksModule {}
