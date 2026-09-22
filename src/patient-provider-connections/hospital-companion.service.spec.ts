import { HospitalCompanionService } from './hospital-companion.service';

function repository(rows: any[] = []) {
  const query: any = { getMany: jest.fn().mockResolvedValue(rows) };
  for (const name of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy']) query[name] = jest.fn().mockReturnValue(query);
  return { find: jest.fn().mockResolvedValue(rows), findOne: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(query) };
}
describe('HospitalCompanionService', () => {
  function setup(attempts: any[] = [], fundings: any[] = []) {
    const patients = repository(); patients.findOne.mockResolvedValue({ id: 'patient' });
    const connections = repository(); connections.findOne.mockResolvedValue({ reference: 'connection', patientId: 'patient', providerId: 'hospital', status: 'CONNECTED', provider: { displayName: 'Hospital', providerReference: 'provider' } });
    const orders = repository([{ id: 'order', reference: 'order-ref', type: 'LABORATORY' }]);
    const fulfillment = repository(attempts);
    const funding = repository(fundings);
    const empty = repository();
    const service = new HospitalCompanionService(connections as any, patients as any, orders as any, fulfillment as any, funding as any, empty as any, empty as any, empty as any);
    return { service, connections, orders, fulfillment, funding };
  }
  it('returns an empty companion for a connected hospital with no orders', async () => {
    const { service, orders, fulfillment } = setup();
    orders.find.mockResolvedValue([]);
    expect(await service.patientView({ id: 'user' } as any, 'connection')).toMatchObject({ requests: [], nextAction: { kind: 'NO_ACTION' } });
    expect(fulfillment.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('scopes the connection and orders to the signed-in patient and hospital', async () => {
    const { service, connections, orders } = setup();
    await service.patientView({ id: 'user' } as any, 'connection');
    expect(connections.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { reference: 'connection', patientId: 'patient' } }));
    expect(orders.find).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient', orderingProviderId: 'hospital', status: 'ISSUED' } }));
  });
  it('does not resurrect an old fulfillment when the newest was cancelled', async () => {
    const { service, funding } = setup([
      { id: 'new', clinicalOrderId: 'order', status: 'CANCELLED' },
      { id: 'old', clinicalOrderId: 'order', status: 'ACCEPTED' },
    ]);
    const result = await service.patientView({ id: 'user' } as any, 'connection');
    expect(result.requests[0].fulfillmentReference).toBeNull();
    expect(funding.createQueryBuilder).not.toHaveBeenCalled();
  });
  it.each(['CANCELLED', 'REQUIRES_REFUND_REVIEW', 'PAID'])('does not count %s funding as payable', async status => {
    const { service } = setup([{ id: 'f', reference: 'fulfillment', clinicalOrderId: 'order', status: 'ACCEPTED' }], [{ fulfillmentId: 'f', grossAmountMinor: '4000', currency: 'NGN', status }]);
    const result = await service.patientView({ id: 'user' } as any, 'connection');
    expect(result.consolidatedPayment.itemCount).toBe(0);
    expect(result.nextAction.kind).not.toBe('PAYMENT_REQUIRED');
  });
  it('reports pending individual payments without advertising unsupported grouped settlement', async () => {
    const { service } = setup([{ id: 'f', clinicalOrderId: 'order', status: 'ACCEPTED' }], [{ fulfillmentId: 'f', grossAmountMinor: '4000', currency: 'NGN', status: 'PENDING' }]);
    const result = await service.patientView({ id: 'user' } as any, 'connection');
    expect(result.consolidatedPayment).toMatchObject({ available: false, itemCount: 1, amountMinor: 4000, currency: 'NGN' });
    expect(result.nextAction.kind).toBe('PAYMENT_REQUIRED');
  });
});
