import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigType } from "@nestjs/config";
import { Repository } from "typeorm";
import { randomBytes } from "node:crypto";
import { isEmail } from "class-validator";
import { appConfig } from "../config/app.config";
import { User } from "../users/entities/user.entity";
import { Patient } from "../patients/entities/patient.entity";
import { PatientProviderConnection } from "../patient-provider-connections/entities/patient-provider-connection.entity";
import { PatientProviderConnectionStatus } from "../patient-provider-connections/enums/patient-provider-connection-status.enum";
import { PaymentProviderRegistry } from "../payments/payment-provider.registry";
import { PaymentProvider } from "../payments/enums/payment-provider.enum";
import { PaymentAttemptStatus } from "../payments/enums/payment-attempt-status.enum";
import { HospitalBillPayment } from "./entities/hospital-bill-payment.entity";
import { HospitalBillPaymentItem } from "./entities/hospital-bill-payment-item.entity";
import { HospitalBillPaymentStatus } from "./enums/hospital-bill-payment-status.enum";
import { HospitalNotificationStatus } from "./enums/hospital-notification-status.enum";
import { CreateHospitalBillPaymentDto } from "./dto/create-hospital-bill-payment.dto";
import {
  HOSPITAL_EMR_ADAPTER,
  HospitalEmrAdapter,
  HospitalInvoice,
} from "./hospital-emr.adapter";
import { HospitalIntegrationService } from "./hospital-integration.service";
import { HospitalIntegrationCode } from "./enums/hospital-integration-code.enum";
import {
  ConnectedHospitalDto,
  HospitalInvoiceDto,
} from "./dto/hospital-bill-payment-read.dto";

const toMinor = (value: string): bigint => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new BadRequestException("Hospital invoice amount is invalid");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const fromMinor = (value: bigint): string =>
  `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

@Injectable()
export class HospitalBillPaymentsService {
  constructor(
    @InjectRepository(HospitalBillPayment)
    private readonly payments: Repository<HospitalBillPayment>,
    @InjectRepository(HospitalBillPaymentItem)
    private readonly items: Repository<HospitalBillPaymentItem>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientProviderConnection)
    private readonly connections: Repository<PatientProviderConnection>,
    private readonly providers: PaymentProviderRegistry,
    private readonly integrations: HospitalIntegrationService,
    @Inject(HOSPITAL_EMR_ADAPTER) private readonly emr: HospitalEmrAdapter,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async connectedHospitals(userId: string): Promise<ConnectedHospitalDto[]> {
    const patient = await this.patients.findOne({ where: { userId } });
    if (!patient) return [];
    const connections = await this.connections.find({
      where: {
        patientId: patient.id,
        status: PatientProviderConnectionStatus.CONNECTED,
      },
      relations: { provider: true },
    });
    const result: ConnectedHospitalDto[] = [];
    const seen = new Set<string>();
    for (const connection of connections) {
      const code = connection.provider?.hospitalCode?.trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      let metadata: { hospitalCode: string; name: string; logo: string };
      try {
        metadata = this.integrations.metadata(code as HospitalIntegrationCode);
      } catch {
        continue;
      }
      seen.add(code);
      result.push({
        ...metadata,
        patientReference: patient.patientReference,
        externalPatientReference: connection.externalPatientReference,
      });
    }
    return result;
  }

  async invoiceForPatient(
    userId: string,
    hospitalCode: string,
    invoiceReference?: string,
  ): Promise<HospitalInvoiceDto> {
    const normalizedCode = hospitalCode.trim().toUpperCase();
    this.integrations.resolve(normalizedCode);
    const patient = await this.patients.findOne({ where: { userId } });
    if (!patient) throw new NotFoundException("Patient profile was not found");
    const connection = await this.connections.findOne({
      where: {
        patientId: patient.id,
        status: PatientProviderConnectionStatus.CONNECTED,
      },
      relations: { provider: true },
    });
    if (
      !connection ||
      connection.status !== PatientProviderConnectionStatus.CONNECTED ||
      connection.provider?.hospitalCode?.trim().toUpperCase() !== normalizedCode
    )
      throw new NotFoundException("Connected hospital was not found");
    const resolved = this.integrations.resolveConnectedPatient(connection);
    if (!invoiceReference?.trim()) {
      throw new BadRequestException("An invoice reference is required");
    }
    const invoice = await resolved.adapter.getInvoiceForPatient({
      externalPatientReference: resolved.externalPatientReference,
      invoiceReference: invoiceReference.trim(),
    });
    const metadata = this.integrations.metadata(resolved.hospitalCode);
    return {
      hospital: {
        ...metadata,
        patientReference: patient.patientReference,
        externalPatientReference: resolved.externalPatientReference,
      },
      patient: {
        displayName:
          `${patient.givenName} ${patient.familyName}`.trim() || null,
        externalReference: resolved.externalPatientReference,
      },
      reference: invoice.invoiceReference ?? null,
      date: invoice.date ?? null,
      currency: invoice.currency,
      total: invoice.total ?? null,
      outstanding: invoice.outstanding ?? null,
      items: invoice.items.map((item) => ({
        itemReference: item.itemReference,
        description: item.description,
        amount: item.amount ?? null,
        payable: item.payable ?? null,
      })),
    };
  }

  async initialize(userId: string, dto: CreateHospitalBillPaymentDto) {
    if (dto.hospitalCode.trim().toUpperCase() !== "AKTH")
      throw new BadRequestException("Unsupported hospital");
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User was not found");
    const email = (user.email ?? dto.paymentEmail ?? "").trim().toLowerCase();
    if (!isEmail(email))
      throw new BadRequestException(
        "A valid payment email is required to continue",
      );
    const invoice = await this.emr.getInvoice(dto.invoiceReference.trim());
    const invoiceReference =
      invoice.invoiceReference ?? dto.invoiceReference.trim();
    const selected = [
      ...new Set(dto.items.map((item) => item.itemReference.trim())),
    ];
    if (!selected.length)
      throw new BadRequestException("At least one invoice item is required");
    const itemMap = new Map(
      invoice.items.map((item) => [item.itemReference, item]),
    );
    const selectedItems = selected.map((reference) => itemMap.get(reference));
    if (selectedItems.some((item) => !item))
      throw new BadRequestException(
        "Selected item does not belong to the invoice",
      );
    if (selectedItems.some((item) => !item!.payable))
      throw new ConflictException(
        "One or more selected invoice items are already paid or not payable",
      );
    const amount = fromMinor(
      selectedItems.reduce((sum, item) => sum + toMinor(item!.amount), 0n),
    );
    if (toMinor(amount) <= 0n)
      throw new ConflictException(
        "Selected invoice items have no payable amount",
      );

    const reference = `SC-HBP-${randomBytes(10).toString("hex").toUpperCase()}`;
    const saved = await this.payments.manager.transaction(async (manager) => {
      const payment = await manager.getRepository(HospitalBillPayment).save(
        manager.getRepository(HospitalBillPayment).create({
          reference,
          userId,
          hospitalCode: "AKTH",
          invoiceReference,
          amount,
          currency: invoice.currency.toUpperCase(),
          status: HospitalBillPaymentStatus.PENDING,
          gatewayReference: null,
          gatewayProvider: null,
          checkoutUrl: null,
          accessCode: null,
          hospitalNotificationStatus: HospitalNotificationStatus.PENDING,
          hospitalNotificationReference: null,
          hospitalNotifiedAt: null,
          hospitalNotificationError: null,
        }),
      );
      await manager
        .getRepository(HospitalBillPaymentItem)
        .save(
          selectedItems.map((item) =>
            manager
              .getRepository(HospitalBillPaymentItem)
              .create({
                hospitalBillPaymentId: payment.id,
                itemReference: item!.itemReference,
                description: item!.description,
                amount: item!.amount,
              }),
          ),
        );
      return payment;
    });

    try {
      const initialized = await this.providers
        .resolve(dto.paymentProvider)
        .initializePayment({
          amount,
          currency: invoice.currency.toUpperCase(),
          idempotencyKey: `HBP-${saved.id}`,
          bookingReference: reference,
          customerEmail: email,
          paymentReference: reference,
          callbackUrl:
            dto.paymentProvider === PaymentProvider.OPAY ||
            (!dto.paymentProvider && this.config.payments.provider === "opay")
              ? this.config.payments.opay.returnUrl
              : this.config.payments.paystack.patientCallbackUrl,
        });
      await this.payments.update(
        { id: saved.id },
        {
          gatewayReference: initialized.providerReference,
          gatewayProvider: initialized.providerCode,
          checkoutUrl: initialized.checkoutUrl,
          accessCode: initialized.accessCode,
          status: HospitalBillPaymentStatus.PENDING,
        },
      );
    } catch (error) {
      await this.payments.update(
        { id: saved.id },
        { status: HospitalBillPaymentStatus.FAILED },
      );
      throw error;
    }
    return this.view(
      await this.payments.findOne({
        where: { id: saved.id },
        relations: { items: true },
      }),
    );
  }

  async verify(userId: string, reference: string) {
    const payment = await this.payments.findOne({
      where: { reference, userId },
      relations: { items: true },
    });
    if (!payment)
      throw new NotFoundException("Hospital bill payment was not found");
    if (payment.status === HospitalBillPaymentStatus.PAID)
      return this.view(payment);
    if (
      payment.status ===
        HospitalBillPaymentStatus.PAYMENT_RECEIVED_HOSPITAL_PENDING &&
      payment.hospitalNotificationStatus !== HospitalNotificationStatus.FAILED
    )
      return this.view(payment);
    if (!payment.gatewayReference || !payment.gatewayProvider)
      throw new ConflictException(
        "Hospital bill payment is not ready for verification",
      );
    const verified = await this.providers
      .resolve(payment.gatewayProvider as PaymentProvider)
      .verifyPayment(payment.gatewayReference);
    if (
      !verified.succeeded ||
      verified.providerReference !== payment.gatewayReference ||
      verified.amount !== payment.amount ||
      verified.currency.toUpperCase() !== payment.currency
    ) {
      const status = verified.succeeded
        ? HospitalBillPaymentStatus.FAILED
        : verified.status === PaymentAttemptStatus.PENDING_CONFIRMATION
          ? HospitalBillPaymentStatus.PENDING
          : HospitalBillPaymentStatus.FAILED;
      await this.payments.update({ id: payment.id }, { status });
      return this.view(
        await this.payments.findOne({
          where: { id: payment.id },
          relations: { items: true },
        }),
      );
    }
    const claimed = await this.payments.manager.transaction(async (manager) => {
      const locked = await manager
        .getRepository(HospitalBillPayment)
        .findOne({
          where: { id: payment.id },
          lock: { mode: "pessimistic_write" },
          relations: { items: true },
        });
      if (!locked)
        throw new NotFoundException("Hospital bill payment was not found");
      if (locked.status === HospitalBillPaymentStatus.PAID) return locked;
      if (
        locked.status ===
          HospitalBillPaymentStatus.PAYMENT_RECEIVED_HOSPITAL_PENDING &&
        locked.hospitalNotificationStatus !== HospitalNotificationStatus.FAILED
      )
        return locked;
      locked.status =
        HospitalBillPaymentStatus.PAYMENT_RECEIVED_HOSPITAL_PENDING;
      locked.hospitalNotificationStatus = HospitalNotificationStatus.PENDING;
      return manager.getRepository(HospitalBillPayment).save(locked);
    });
    if (
      claimed.hospitalNotificationStatus !== HospitalNotificationStatus.SENT
    ) {
      try {
        const result = await this.emr.notifyPayment({
          invoiceReference: claimed.invoiceReference,
          paymentReference: claimed.reference,
          amount: claimed.amount,
          currency: claimed.currency,
        });
        if (!result.accepted)
          throw new Error("Hospital rejected payment notification");
        await this.payments.update(
          { id: claimed.id },
          {
            status: HospitalBillPaymentStatus.PAID,
            hospitalNotificationStatus: HospitalNotificationStatus.SENT,
            hospitalNotificationReference: result.reference,
            hospitalNotifiedAt: new Date(),
            hospitalNotificationError: null,
          },
        );
      } catch (error) {
        await this.payments.update(
          { id: claimed.id },
          {
            status: HospitalBillPaymentStatus.PAYMENT_RECEIVED_HOSPITAL_PENDING,
            hospitalNotificationStatus: HospitalNotificationStatus.FAILED,
            hospitalNotificationError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Hospital notification failed",
          },
        );
      }
    }
    return this.view(
      await this.payments.findOne({
        where: { id: payment.id },
        relations: { items: true },
      }),
    );
  }

  private view(payment: HospitalBillPayment | null) {
    if (!payment)
      throw new NotFoundException("Hospital bill payment was not found");
    return {
      reference: payment.reference,
      hospitalCode: payment.hospitalCode,
      invoiceReference: payment.invoiceReference,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      gatewayReference: payment.gatewayReference,
      provider: payment.gatewayProvider,
      checkoutUrl: payment.checkoutUrl,
      accessCode: payment.accessCode,
      hospitalNotificationStatus: payment.hospitalNotificationStatus,
      hospitalNotificationReference: payment.hospitalNotificationReference,
      hospitalNotifiedAt: payment.hospitalNotifiedAt,
      items: (payment.items ?? []).map((item) => ({
        itemReference: item.itemReference,
        description: item.description,
        amount: item.amount,
      })),
    };
  }
}
