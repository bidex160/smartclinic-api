import { HospitalWalletSettlementService } from './hospital-wallet-settlement.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientProviderConnection } from './entities/patient-provider-connection.entity';
import { ClinicalOrder } from '../clinical-orders/entities/clinical-order.entity';
import { ClinicalOrderFulfillment } from '../clinical-orders/entities/clinical-order-fulfillment.entity';

describe('HospitalWalletSettlementService eligibility', () => {
  function setup(orders: any[], attempts: any[]) {
    const query: any = { getMany: jest.fn().mockResolvedValue(attempts) };
    for (const name of ['setLock', 'where', 'andWhere', 'orderBy', 'addOrderBy']) query[name] = jest.fn().mockReturnValue(query);
    const orderRepo = { find: jest.fn().mockResolvedValue(orders) };
    const repos = new Map<any, any>([
      [Patient, { findOne: jest.fn().mockResolvedValue({ id: 'patient' }) }],
      [PatientProviderConnection, { findOne: jest.fn().mockResolvedValue({ id: 'connection', providerId: 'hospital', status: 'CONNECTED' }) }],
      [ClinicalOrder, orderRepo],
      [ClinicalOrderFulfillment, { createQueryBuilder: jest.fn().mockReturnValue(query) }],
    ]);
    const manager = { getRepository: (entity: any) => repos.get(entity) };
    const connectionRepo = { manager: { transaction: async (work: any) => work(manager) } };
    const wallet = { debitHospitalPaymentWithManager: jest.fn() };
    return { service: new HospitalWalletSettlementService({} as any, connectionRepo as any, wallet as any, {} as any, {} as any), wallet, orderRepo };
  }
  it('rejects an empty bill before querying an empty fulfillment list or debiting', async () => {
    const { service, wallet, orderRepo } = setup([], []);
    await expect(service.payAll('user', 'connection')).rejects.toThrow('no hospital requests');
    expect(orderRepo.find).toHaveBeenCalledWith({ where: { patientId: 'patient', orderingProviderId: 'hospital', status: 'ISSUED' } });
    expect(wallet.debitHospitalPaymentWithManager).not.toHaveBeenCalled();
  });
  it.each(['CANCELLED', 'SELECTED', 'PROPOSED'])('does not charge an older accepted attempt after a newer %s attempt', async status => {
    const { service, wallet } = setup([{ id: 'order' }], [
      { id: 'new', clinicalOrderId: 'order', status },
      { id: 'old', clinicalOrderId: 'order', status: 'ACCEPTED' },
    ]);
    await expect(service.payAll('user', 'connection')).rejects.toThrow('no payable hospital requests');
    expect(wallet.debitHospitalPaymentWithManager).not.toHaveBeenCalled();
  });
});
