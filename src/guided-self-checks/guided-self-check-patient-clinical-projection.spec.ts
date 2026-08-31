import { GuidedSelfCheckClassificationsService } from './guided-self-check-classifications.service';
import { GuidedSelfCheckClassification, GuidedSelfCheckPatientMessageKey } from './enums/guided-self-check-classification.enum';

describe('Guided Self-Check patient clinical projection', () => {
  it('keeps RED urgent guidance immediate and exposes only patient guidance after review completion', async () => {
    const check = { id: 'check', reference: 'SC-GSC-X', userId: 'patient' };
    const classification = { guidedSelfCheckId: 'check', classification: GuidedSelfCheckClassification.RED, requiresProfessionalReview: true, urgentAction: true, patientMessageKey: GuidedSelfCheckPatientMessageKey.RED_URGENT, classifiedAt: new Date() };
    const review = { status: 'COMPLETED', completedAt: new Date(), patientGuidance: 'Please arrange the recommended assessment.', internalClinicalNote: 'Never expose this.', operationalNote: 'Internal operations only.' };
    const analysis = null;
    const data: any = { manager: { getRepository: jest.fn((entity: any) => ({ findOne: jest.fn().mockResolvedValue(entity.name === 'GuidedSelfCheckProfessionalReview' ? review : analysis) })) } };
    const service = new GuidedSelfCheckClassificationsService({ findOne: jest.fn().mockResolvedValue(classification) } as never, { findOne: jest.fn().mockResolvedValue(check) } as never, data);
    const result = await service.getPatientResult(check.reference, check.userId);
    expect(result).toMatchObject({ classification: { classification: 'RED', urgentAction: true, message: 'Please do not wait for an online review.' }, professionalReview: { status: 'COMPLETED', patientGuidance: 'Please arrange the recommended assessment.' } });
    expect(JSON.stringify(result)).not.toContain('Never expose this');
    expect(JSON.stringify(result)).not.toContain('Internal operations only');
  });
});
