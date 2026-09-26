import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientProviderConnection } from './entities/patient-provider-connection.entity';
import { PatientProviderConnectionStatus } from './enums/patient-provider-connection-status.enum';
import { ClinicalOrder } from '../clinical-orders/entities/clinical-order.entity';
import { ClinicalOrderStatus } from '../clinical-orders/enums/clinical-order-status.enum';
import { ClinicalOrderFulfillment } from '../clinical-orders/entities/clinical-order-fulfillment.entity';
import { DiagnosticFulfillmentFunding, DiagnosticFundingStatus } from '../clinical-orders/entities/diagnostic-fulfillment-funding.entity';
import { PharmacyFulfillmentFunding } from '../clinical-orders/entities/pharmacy-fulfillment-funding.entity';
import { PharmacyFundingStatus } from '../clinical-orders/enums/pharmacy-quote-status.enum';
import { DiagnosticExecution } from '../clinical-orders/entities/diagnostic-execution.entity';
import { PharmacyDispensing } from '../clinical-orders/entities/pharmacy-dispensing.entity';

@Injectable()
export class HospitalCompanionService {
  constructor(
    @InjectRepository(PatientProviderConnection) private readonly connections: Repository<PatientProviderConnection>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ClinicalOrder) private readonly orders: Repository<ClinicalOrder>,
    @InjectRepository(ClinicalOrderFulfillment) private readonly fulfillments: Repository<ClinicalOrderFulfillment>,
    @InjectRepository(DiagnosticFulfillmentFunding) private readonly diagnosticFunding: Repository<DiagnosticFulfillmentFunding>,
    @InjectRepository(PharmacyFulfillmentFunding) private readonly pharmacyFunding: Repository<PharmacyFulfillmentFunding>,
    @InjectRepository(DiagnosticExecution) private readonly diagnosticExecutions: Repository<DiagnosticExecution>,
    @InjectRepository(PharmacyDispensing) private readonly pharmacyDispensings: Repository<PharmacyDispensing>,
  ) {}

  async patientView(user: User, reference: string) {
    const patient = await this.patients.findOne({ where: { userId: user.id } });
    if (!patient) throw new NotFoundException('Patient profile was not found');

    const connection = await this.connections.findOne({
      where: { reference, patientId: patient.id },
      relations: { provider: true },
    });
    if (!connection) throw new NotFoundException('Hospital connection was not found');
    if (connection.status !== PatientProviderConnectionStatus.CONNECTED) {
      throw new ConflictException('Hospital companion is available after the hospital connection is confirmed');
    }

    // Hospital Companion is intentionally encounter-driven. These are orders
    // issued by this connected hospital; standalone patient marketplace orders
    // remain in their existing Get a Test / Get Medicine flows.
    const orders = await this.orders.find({
      where: {
        patientId: patient.id,
        orderingProviderId: connection.providerId,
        status: ClinicalOrderStatus.ISSUED,
      },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const orderIds = orders.map(order => order.id);
    const fulfillments = orderIds.length
      ? await this.fulfillments.createQueryBuilder('fulfillment')
          .leftJoinAndSelect('fulfillment.fulfillmentServiceUnit', 'serviceUnit')
          .where('fulfillment.clinicalOrderId IN (:...orderIds)', { orderIds })
          .andWhere("fulfillment.status <> 'CANCELLED'")
          .orderBy('fulfillment.createdAt', 'DESC')
          .getMany()
      : [];

    const fulfillmentIds = fulfillments.map(item => item.id);
    const [diagnosticFunding, pharmacyFunding, diagnosticExecutions, pharmacyDispensings] =
      fulfillmentIds.length
        ? await Promise.all([
            this.diagnosticFunding.createQueryBuilder('funding').where('funding.fulfillmentId IN (:...ids)', { ids: fulfillmentIds }).getMany(),
            this.pharmacyFunding.createQueryBuilder('funding').where('funding.fulfillmentId IN (:...ids)', { ids: fulfillmentIds }).getMany(),
            this.diagnosticExecutions.createQueryBuilder('execution').where('execution.fulfillmentId IN (:...ids)', { ids: fulfillmentIds }).getMany(),
            this.pharmacyDispensings.createQueryBuilder('dispensing').where('dispensing.fulfillmentId IN (:...ids)', { ids: fulfillmentIds }).getMany(),
          ])
        : [[], [], [], []];

    const fulfillmentByOrder = new Map<string, ClinicalOrderFulfillment>();
    for (const fulfillment of fulfillments) if (!fulfillmentByOrder.has(fulfillment.clinicalOrderId)) fulfillmentByOrder.set(fulfillment.clinicalOrderId, fulfillment);
    const diagnosticFundingByFulfillment = new Map(diagnosticFunding.map(item => [item.fulfillmentId, item]));
    const pharmacyFundingByFulfillment = new Map(pharmacyFunding.map(item => [item.fulfillmentId, item]));
    const executionByFulfillment = new Map(diagnosticExecutions.map(item => [item.fulfillmentId, item]));
    const dispensingByFulfillment = new Map(pharmacyDispensings.map(item => [item.fulfillmentId, item]));

    const requests = orders.map(order => {
      const fulfillment = fulfillmentByOrder.get(order.id);
      const diagnostic = fulfillment ? diagnosticFundingByFulfillment.get(fulfillment.id) : undefined;
      const pharmacy = fulfillment ? pharmacyFundingByFulfillment.get(fulfillment.id) : undefined;
      const execution = fulfillment ? executionByFulfillment.get(fulfillment.id) : undefined;
      const dispensing = fulfillment ? dispensingByFulfillment.get(fulfillment.id) : undefined;
      const funding = diagnostic ?? pharmacy;
      const paid = diagnostic
        ? [DiagnosticFundingStatus.PAID, DiagnosticFundingStatus.SATISFIED_FREE].includes(diagnostic.status)
        : pharmacy
          ? [PharmacyFundingStatus.PAID, PharmacyFundingStatus.SATISFIED_FREE].includes(pharmacy.status)
          : false;
      return {
        orderReference: order.reference,
        type: order.type,
        issuedAt: order.issuedAt,
        clinicalNote: order.clinicalNote,
        fulfillmentReference: fulfillment?.reference ?? null,
        serviceUnit: fulfillment?.fulfillmentServiceUnit?.name ?? null,
        amountMinor: funding ? Number(funding.grossAmountMinor) : null,
        currency: funding?.currency ?? null,
        paymentStatus: funding ? (paid ? 'PAID' : funding.status) : 'NOT_PRICED',
        serviceStatus: execution?.status ?? dispensing?.status ?? fulfillment?.status ?? 'REQUESTED',
        resultReady: execution?.status === 'RESULT_READY',
      };
    });

    const payable = requests.filter(item => item.amountMinor != null && item.paymentStatus === DiagnosticFundingStatus.PENDING);
    const currencies = [...new Set(payable.map(item => item.currency).filter(Boolean))];
    const consolidatedPayment = {
      available: currencies.length === 1 && payable.length > 0,
      itemCount: payable.length,
      amountMinor: currencies.length === 1 ? payable.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0) : null,
      currency: currencies.length === 1 ? currencies[0] : null,
    };

    const resultReady = requests.filter(item => item.resultReady).length;
    const paidWaiting = requests.filter(item => item.paymentStatus === 'PAID' && !item.resultReady).length;
    const nextAction = payable.length
      ? { kind: 'PAYMENT_REQUIRED', title: payable.length === 1 ? 'Payment required' : `${payable.length} requests need payment`, action: 'REVIEW_REQUESTS' }
      : resultReady
        ? { kind: 'RESULT_READY', title: resultReady === 1 ? 'Your result is ready' : `${resultReady} results are ready`, action: 'VIEW_RESULTS' }
        : paidWaiting
          ? { kind: 'PROCEED_TO_SERVICE', title: 'Payment confirmed — continue your care', action: 'VIEW_REQUESTS' }
          : { kind: 'NO_ACTION', title: 'You are up to date at this hospital', action: null };

    return {
      provider: { reference: connection.provider.providerReference, displayName: connection.provider.displayName },
      connection: { reference: connection.reference, externalPatientReference: connection.externalPatientReference, connectedAt: connection.connectedAt },
      nextAction,
      requests,
      consolidatedPayment,
      servicePass: null, // Added when grouped hospital settlement/service-pass persistence lands.
    };
  }
}
