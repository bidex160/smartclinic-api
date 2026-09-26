import { hospitalSettlementReference } from './hospital-settlement-reference';

describe('hospitalSettlementReference', () => {
  it('is deterministic regardless of item order', () => {
    expect(hospitalSettlementReference('SC-HOSP-123', ['funding-b', 'funding-a']))
      .toBe(hospitalSettlementReference('SC-HOSP-123', ['funding-a', 'funding-b']));
  });

  it('changes when the payable item set changes', () => {
    expect(hospitalSettlementReference('SC-HOSP-123', ['funding-a']))
      .not.toBe(hospitalSettlementReference('SC-HOSP-123', ['funding-a', 'funding-b']));
  });

  it('stays within the wallet source-reference limit for large multi-item bills', () => {
    const ids = Array.from({ length: 100 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    expect(hospitalSettlementReference('SC-HOSP-123456789', ids).length).toBeLessThanOrEqual(100);
  });
});
