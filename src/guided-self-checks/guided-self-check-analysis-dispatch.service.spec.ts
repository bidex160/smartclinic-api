import { GuidedSelfCheckAnalysisDispatchService } from './guided-self-check-analysis-dispatch.service';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';

describe('GuidedSelfCheckAnalysisDispatchService', () => {
  it('automatically schedules the committed AMBER analysis through the existing processor', async () => {
    const analysis = { reference: 'SC-GSA-AUTO' };
    const analyses = { findOne: jest.fn().mockResolvedValue(analysis) };
    const processor = { process: jest.fn().mockResolvedValue({ status: 'COMPLETED' }) };
    const service = new GuidedSelfCheckAnalysisDispatchService(analyses as never, processor as never);

    await service.dispatchForClassification({ id: 'classification', classification: GuidedSelfCheckClassification.AMBER } as never);
    expect(processor.process).not.toHaveBeenCalled();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(processor.process).toHaveBeenCalledWith(analysis.reference);
  });

  it.each([GuidedSelfCheckClassification.GREEN, GuidedSelfCheckClassification.RED])('does not dispatch %s through AMBER AI', async classification => {
    const analyses = { findOne: jest.fn() };
    const processor = { process: jest.fn() };
    const service = new GuidedSelfCheckAnalysisDispatchService(analyses as never, processor as never);
    await service.dispatchForClassification({ id: 'classification', classification } as never);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(analyses.findOne).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('isolates unexpected background failure from the completed patient request and logs no patient data', async () => {
    const analyses = { findOne: jest.fn().mockResolvedValue({ reference: 'SC-GSA-AUTO' }) };
    const processor = { process: jest.fn().mockRejectedValue(new Error('provider failed')) };
    const service = new GuidedSelfCheckAnalysisDispatchService(analyses as never, processor as never);
    const log = jest.spyOn((service as any).logger, 'error').mockImplementation();
    await expect(service.dispatchForClassification({ id: 'classification', classification: GuidedSelfCheckClassification.AMBER } as never)).resolves.toBeUndefined();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ analysisReference: 'SC-GSA-AUTO', errorName: 'Error' }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/questionnaire|answer|patient|email|phone/i);
  });
});
