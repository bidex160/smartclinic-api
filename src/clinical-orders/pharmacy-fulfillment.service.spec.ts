import { ConflictException } from '@nestjs/common';
import { PharmacyFulfillmentService } from './pharmacy-fulfillment.service';
import { ClinicalOrderFulfillmentStatus } from './enums/clinical-order-fulfillment-status.enum';
import { PharmacyQuoteItemAvailability } from './enums/pharmacy-quote-status.enum';
import { PharmacyQuoteItem } from './entities/pharmacy-quote-item.entity';
import { PharmacyQuote } from './entities/pharmacy-quote.entity';

describe('PharmacyFulfillmentService quote rules', () => {
  const subject: any = new PharmacyFulfillmentService({} as any, {} as any, {} as any, {} as any, {} as any);

  it('requires an accepted routing assignment before pharmacy review', () => {
    expect(() => subject.requireAccepted({ status: ClinicalOrderFulfillmentStatus.SELECTED })).toThrow(ConflictException);
    expect(() => subject.requireAccepted({ status: ClinicalOrderFulfillmentStatus.ACCEPTED })).not.toThrow();
  });

  it('preserves every prescribed item and calculates authoritative totals', async () => {
    const rx = [
      { id: 'a', sortOrder: 0, medicationName: 'Medicine A' },
      { id: 'b', sortOrder: 1, medicationName: 'Medicine B' },
    ];
    subject.prescriptionItems = jest.fn().mockResolvedValue(rx);
    let saved: any[] = [];
    const quote: any = { id: 'quote', fulfillmentId: 'fulfillment', totalMinor: '0' };
    const itemRepo: any = {
      create: (value: any) => value,
      delete: jest.fn(),
      save: jest.fn(async (value: any[]) => { saved = value; }),
    };
    const quoteRepo = { save: jest.fn(async (value: any) => value) };
    const manager: any = {
      getRepository: (entity: any) => entity === PharmacyQuoteItem ? itemRepo : entity === PharmacyQuote ? quoteRepo : {},
    };
    await subject.replaceItems(manager, quote, {
      currency: 'NGN', expiresAt: new Date(Date.now() + 60000).toISOString(),
      items: [
        { sortOrder: 0, availability: PharmacyQuoteItemAvailability.AVAILABLE, quantitySupplied: 2, unitPriceMinor: 500 },
        { sortOrder: 1, availability: PharmacyQuoteItemAvailability.UNAVAILABLE, quantitySupplied: 0, unitPriceMinor: 0 },
      ],
    });
    expect(saved).toHaveLength(2);
    expect(saved[1].quotedMedicationLabel).toBe('Medicine B');
    expect(quote.totalMinor).toBe('1000');
    expect(quoteRepo.save).toHaveBeenCalledWith(quote);
  });

  it('rejects omitted items and payable unavailable lines', async () => {
    subject.prescriptionItems = jest.fn().mockResolvedValue([
      { id: 'a', sortOrder: 0, medicationName: 'A' },
      { id: 'b', sortOrder: 1, medicationName: 'B' },
    ]);
    const manager: any = { getRepository: () => ({ create: (value: any) => value, delete: jest.fn(), save: jest.fn() }) };
    await expect(subject.replaceItems(manager, { id: 'q', fulfillmentId: 'f' }, {
      items: [{ sortOrder: 0, availability: PharmacyQuoteItemAvailability.AVAILABLE, quantitySupplied: 1, unitPriceMinor: 1 }],
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.replaceItems(manager, { id: 'q', fulfillmentId: 'f' }, {
      items: [
        { sortOrder: 0, availability: PharmacyQuoteItemAvailability.AVAILABLE, quantitySupplied: 1, unitPriceMinor: 1 },
        { sortOrder: 1, availability: PharmacyQuoteItemAvailability.UNAVAILABLE, quantitySupplied: 1, unitPriceMinor: 1 },
      ],
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
