import { GuidedSelfCheckAnalysisProviderError, GuidedSelfCheckAnalysisRequest } from './guided-self-check-analysis.port';
import { OpenAiGuidedSelfCheckAnalysisAdapter } from './openai-guided-self-check-analysis.adapter';

const request: GuidedSelfCheckAnalysisRequest = {
  systemInstructions: {
    purpose: 'AMBER_INTERNAL_DECISION_SUPPORT',
    prohibitedOutputs: ['diagnosis', 'classification_override'],
  },
  patientProvidedData: {
    questionnaireVersion: 1,
    classification: 'AMBER',
    matchedReasonCodes: ['TEST_REASON'],
    responses: [{ questionKey: 'reported_note', questionText: 'Reported note', state: 'KNOWN' as never, value: 'Untrusted patient text' }],
  },
  timeoutMs: 15_000,
};

const validOutput = {
  conciseSummary: 'A concise summary of reported information.',
  notableResponses: ['A reported response'],
  inconsistencies: [],
  informationGaps: [],
  suggestedOperationalPriority: 'ROUTINE',
  humanReviewSuggested: false,
  safeReasonCodes: ['TEST_REASON'],
  recommendedAction: null,
  escalationSuggested: false,
};

describe('OpenAiGuidedSelfCheckAnalysisAdapter', () => {
  it('uses the Responses API strict schema and sends no patient identity or commercial data', async () => {
    const create = jest.fn().mockResolvedValue({ output_text: JSON.stringify(validOutput) });
    const adapter = new OpenAiGuidedSelfCheckAnalysisAdapter({ responses: { create } } as never, 'configured-model', 15_000);

    await expect(adapter.analyze(request)).resolves.toEqual(validOutput);
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({ model: 'configured-model', store: false, text: { format: { type: 'json_schema', strict: true } } });
    const serialized = JSON.stringify(body);
    expect(serialized).toContain('Untrusted patient text');
    expect(serialized).not.toMatch(/patientName|email|phone|address|payment|booking|userId|session/i);
    expect(body.instructions).toContain('already been classified AMBER');
    expect(body.instructions).toContain('untrusted data');
  });

  it('rejects malformed structured output', async () => {
    const adapter = new OpenAiGuidedSelfCheckAnalysisAdapter({ responses: { create: jest.fn().mockResolvedValue({ output_text: '{bad json' }) } } as never, 'model', 15_000);
    await expect(adapter.analyze(request)).rejects.toMatchObject({ failureCode: 'INVALID_OUTPUT' });
  });

  it('maps timeouts without logging or exposing provider details', async () => {
    const timeout = Object.assign(new Error('sensitive provider details'), { name: 'TimeoutError' });
    const adapter = new OpenAiGuidedSelfCheckAnalysisAdapter({ responses: { create: jest.fn().mockRejectedValue(timeout) } } as never, 'model', 15_000);
    const log = jest.spyOn(console, 'error').mockImplementation();
    await expect(adapter.analyze(request)).rejects.toEqual(expect.objectContaining<Partial<GuidedSelfCheckAnalysisProviderError>>({ failureCode: 'TIMEOUT' }));
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('sanitizes rate-limit and other provider failures', async () => {
    const adapter = new OpenAiGuidedSelfCheckAnalysisAdapter({ responses: { create: jest.fn().mockRejectedValue(Object.assign(new Error('provider payload'), { status: 429 })) } } as never, 'model', 15_000);
    await expect(adapter.analyze(request)).rejects.toMatchObject({ failureCode: 'PROCESSING_ERROR', message: 'OpenAI analysis request failed' });
  });
});
