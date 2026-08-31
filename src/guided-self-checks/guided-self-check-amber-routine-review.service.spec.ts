import { ForbiddenException } from '@nestjs/common';
import { GuidedSelfCheckProfessionalReviewsService } from './guided-self-check-professional-reviews.service';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckReviewDecision, GuidedSelfCheckReviewModel, GuidedSelfCheckReviewPriority, GuidedSelfCheckReviewStatus } from './enums/guided-self-check-review.enum';
import { GuidedSelfCheckNextActionType } from './enums/guided-self-check-next-action.enum';

describe('Guided Self-Check AMBER internal routine review',()=>{
 function harness(){
  let stored:any=null;
  const reviewRepo={findOne:jest.fn(async()=>stored),create:jest.fn((x:any)=>x),save:jest.fn(async(x:any)=>stored={id:'review',reference:'SC-GSR-AMBER000001',...x})};
  const historyRepo={save:jest.fn()};
  const manager:any={getRepository:jest.fn((e:any)=>e.name==='GuidedSelfCheckProfessionalReview'?reviewRepo:historyRepo),save:reviewRepo.save};
  const professional={id:'professional',reference:'SC-ICP-AMBER000001',userId:'clinician',capabilities:['SELF_CHECK_CLINICAL_REVIEW']};
  const professionals={eligible:jest.fn().mockResolvedValue(professional),activeForUser:jest.fn().mockResolvedValue(professional),requireCapability:jest.fn((_:any,cap:string)=>{if(cap!=='SELF_CHECK_CLINICAL_REVIEW')throw new ForbiddenException();})};
  const actions={selectForReview:jest.fn(),allowed:jest.fn().mockReturnValue([GuidedSelfCheckNextActionType.FIND_CARE])};
  const service=new GuidedSelfCheckProfessionalReviewsService(reviewRepo as never,{transaction:jest.fn((fn:any)=>fn(manager))}as never,actions as never,professionals as never);
  const analysis:any={id:'analysis',reference:'SC-GSA-AMBER00001',guidedSelfCheckId:'check',classificationId:'classification',humanReviewRecommended:true,classification:{classification:GuidedSelfCheckClassification.AMBER}};
  return{service,reviewRepo,historyRepo,manager,analysis,professional,professionals,actions,get review(){return stored;}};
 }
 it('creates exactly one Provider-free routine review only when validated policy recommends it',async()=>{const h=harness();const first=await h.service.ensureRoutineForAnalysis(h.manager,h.analysis);const second=await h.service.ensureRoutineForAnalysis(h.manager,h.analysis);expect(first).toMatchObject({classificationSnapshot:'AMBER',reviewModel:'INTERNAL_ROUTINE',priority:'ROUTINE',status:'PENDING',assignedReviewerProviderId:null});expect(second).toBe(first);expect(h.reviewRepo.save).toHaveBeenCalledTimes(1);expect(h.historyRepo.save).toHaveBeenCalledWith(expect.objectContaining({event:'HUMAN_REVIEW_TRIGGERED'}));});
 it('does not create a routine review without human-review policy output',async()=>{const h=harness();await expect(h.service.ensureRoutineForAnalysis(h.manager,{...h.analysis,humanReviewRecommended:false})).resolves.toBeNull();expect(h.reviewRepo.save).not.toHaveBeenCalled();});
 it('uses routine capability for assignment and clinical completion while preserving AMBER',async()=>{const h=harness();await h.service.ensureRoutineForAnalysis(h.manager,h.analysis);h.review.selfCheck={reference:'SC-GSC-AMBER0001'};h.review.classificationResult={urgentAction:false};h.review.history=[];await h.service.assignInternal(h.review.reference,{professionalReference:h.professional.reference},'operations');expect(h.professionals.eligible).toHaveBeenCalledWith(h.professional.reference,'SELF_CHECK_CLINICAL_REVIEW',h.manager);h.review.status=GuidedSelfCheckReviewStatus.IN_REVIEW;h.review.assignedInternalClinicalProfessionalId=h.professional.id;await h.service.completeInternal(h.review.reference,{id:'clinician'}as any,{decision:GuidedSelfCheckReviewDecision.FOLLOW_UP_RECOMMENDED,nextActionType:GuidedSelfCheckNextActionType.FIND_CARE,patientGuidance:'Please use the recommended SmartClinic care pathway.'});expect(h.actions.selectForReview).toHaveBeenCalled();expect(h.review.classificationSnapshot).toBe(GuidedSelfCheckClassification.AMBER);});
});
