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
import { AdminGuidedSelfCheckReviewsController, InternalClinicalGuidedSelfCheckReviewsController } from "./guided-self-check-reviews.controller";
import { GuidedSelfCheckReviewerAuthorization } from "./entities/guided-self-check-reviewer-authorization.entity";
import { GuidedSelfCheckReviewerAuthorizationHistory } from "./entities/guided-self-check-reviewer-authorization-history.entity";
import { GuidedSelfCheckNextAction } from "./entities/guided-self-check-next-action.entity";
import { GuidedSelfCheckNextActionsService } from "./guided-self-check-next-actions.service";
import { HealthCheckPackage } from "../health-checks/entities/health-check-package.entity";
import { GuidedSelfCheckClinicalGovernanceAuthorization } from "./entities/guided-self-check-clinical-governance-authorization.entity";
import { GuidedSelfCheckClinicalGovernanceHistory } from "./entities/guided-self-check-clinical-governance-history.entity";
import { GuidedSelfCheckRulesetAudit } from "./entities/guided-self-check-ruleset-audit.entity";
import { GuidedSelfCheckClinicalGovernanceService } from "./guided-self-check-clinical-governance.service";
import { GuidedSelfCheckClinicalGovernanceAuthorizationsController, GuidedSelfCheckClinicalRulesetsController } from "./guided-self-check-clinical-governance.controller";
import { GuidedSelfCheckClassificationReprocessingService } from "./guided-self-check-classification-reprocessing.service";
import { GuidedSelfCheckClassificationReprocessingController } from "./guided-self-check-classification-reprocessing.controller";
import { GuidedSelfCheckAnalysis } from "./entities/guided-self-check-analysis.entity";
import { GuidedSelfCheckAnalysisService } from "./guided-self-check-analysis.service";
import { GuidedSelfCheckAnalysisController } from "./guided-self-check-analysis.controller";
import { GuidedSelfCheckInternalClinicalProfessional } from "./entities/guided-self-check-internal-clinical-professional.entity";
import { GuidedSelfCheckInternalClinicalProfessionalHistory } from "./entities/guided-self-check-internal-clinical-professional-history.entity";
import { GuidedSelfCheckInternalClinicalProfessionalsService } from "./guided-self-check-internal-clinical-professionals.service";
import { GuidedSelfCheckInternalClinicalProfessionalAdministrationController, GuidedSelfCheckInternalClinicalProfessionalDirectoryController } from "./guided-self-check-internal-clinical-professionals.controller";
import { GuidedSelfCheckContactWorkItem } from "./entities/guided-self-check-contact-work-item.entity";
import { GuidedSelfCheckContactWorkItemsService } from "./guided-self-check-contact-work-items.service";
import { GuidedSelfCheckContactWorkItemsController } from "./guided-self-check-contact-work-items.controller";
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
      GuidedSelfCheckClinicalGovernanceAuthorization,
      GuidedSelfCheckClinicalGovernanceHistory,
      GuidedSelfCheckRulesetAudit,
      GuidedSelfCheckAnalysis,
      GuidedSelfCheckInternalClinicalProfessional,
      GuidedSelfCheckInternalClinicalProfessionalHistory,
      GuidedSelfCheckContactWorkItem,
    ]),
  ],
  controllers: [
    GuidedSelfCheckProductController,
    MeGuidedSelfChecksController,
    AdminGuidedSelfCheckController,
    AdminGuidedSelfCheckClassificationsController,
    AdminGuidedSelfCheckReviewsController,
    GuidedSelfCheckClinicalGovernanceAuthorizationsController,
    GuidedSelfCheckClinicalRulesetsController,
    GuidedSelfCheckClassificationReprocessingController,
    GuidedSelfCheckAnalysisController,
    InternalClinicalGuidedSelfCheckReviewsController,
    GuidedSelfCheckInternalClinicalProfessionalDirectoryController,
    GuidedSelfCheckInternalClinicalProfessionalAdministrationController,
    GuidedSelfCheckContactWorkItemsController,
  ],
  providers: [
    GuidedSelfChecksService,
    GuidedSelfCheckQuestionnairesService,
    GuidedSelfCheckClassificationsService,
    GuidedSelfCheckProfessionalReviewsService,
    GuidedSelfCheckNextActionsService,
    GuidedSelfCheckClinicalGovernanceService,
    GuidedSelfCheckClassificationReprocessingService,
    GuidedSelfCheckAnalysisService,
    GuidedSelfCheckInternalClinicalProfessionalsService,
    GuidedSelfCheckContactWorkItemsService,
  ],
  exports: [GuidedSelfChecksService, GuidedSelfCheckNextActionsService],
})
export class GuidedSelfChecksModule {}
