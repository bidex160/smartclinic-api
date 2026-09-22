import { ProviderOfferExpiryService } from './provider-offer-expiry.service';
describe('ProviderOfferExpiryService', () => {
  afterEach(() => jest.useRealTimers());
  it('runs on the configured interval, prevents overlap, and stops on shutdown', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    const matching = { expireStaleOffers: jest.fn(() => new Promise<void>(resolve => { finish = resolve; })) };
    const worker = new ProviderOfferExpiryService({ providerMatching: { expiryWorkerEnabled: true, expiryIntervalMs: 1000 } } as any, matching as any);
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(3000);
    expect(matching.expireStaleOffers).toHaveBeenCalledTimes(1);
    expect(matching.expireStaleOffers).toHaveBeenCalledWith(null);
    finish();
    await jest.advanceTimersByTimeAsync(1000);
    expect(matching.expireStaleOffers).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
    finish();
    await jest.advanceTimersByTimeAsync(3000);
    expect(matching.expireStaleOffers).toHaveBeenCalledTimes(2);
  });
  it('does not schedule work when disabled', async () => {
    jest.useFakeTimers();
    const matching = { expireStaleOffers: jest.fn() };
    const worker = new ProviderOfferExpiryService({ providerMatching: { expiryWorkerEnabled: false } } as any, matching as any);
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(120000);
    expect(matching.expireStaleOffers).not.toHaveBeenCalled();
  });
});
