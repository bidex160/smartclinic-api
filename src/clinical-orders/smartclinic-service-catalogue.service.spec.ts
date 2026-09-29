import { SmartClinicServiceCatalogueService } from './smartclinic-service-catalogue.service';

describe('SmartClinicServiceCatalogueService', () => {
  it('allows a provisionally active Provider to configure catalogue offerings', async () => {
    const qb: any = {};
    for (const method of ['leftJoinAndMapOne', 'where', 'orderBy', 'addOrderBy']) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getMany = jest.fn().mockResolvedValue([]);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const currentProvider = {
      resolve: jest.fn().mockResolvedValue({ id: 'provider-a' }),
      resolveOperational: jest.fn(),
    };
    const subject = new SmartClinicServiceCatalogueService(repo as any, currentProvider as any);

    await subject.providerOfferings({ id: 'user-a' } as any);

    expect(currentProvider.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }));
    expect(currentProvider.resolveOperational).not.toHaveBeenCalled();
  });
});
