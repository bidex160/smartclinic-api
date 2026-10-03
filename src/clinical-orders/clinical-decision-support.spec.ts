import { withoutNegatives } from './clinical-decision-support.service';

describe('clinical decision support text', () => {
  it('ignores what the patient does not have', () => {
    const t = withoutNegatives('fever and chills for 3 days, no cough. denies chest pain and has headache; without vomiting');
    expect(t).toContain('fever and chills');
    expect(t).toContain('headache');
    expect(t).not.toContain('cough');
    expect(t).not.toContain('chest pain');
    expect(t).not.toContain('vomiting');
  });
});
