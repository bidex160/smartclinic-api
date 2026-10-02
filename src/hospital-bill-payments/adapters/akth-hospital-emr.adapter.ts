import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { appConfig } from '../../config/app.config';
import { HospitalEmrAdapter, HospitalInvoice, HospitalInvoiceItem, HospitalPaymentNotificationResult, HospitalPatientInvoiceLookup } from '../hospital-emr.adapter';

type AkthSettings = {
  baseUrl?: string;
  bearerToken?: string;
  paymentNotificationEndpoint?: string;
};

type AkthPatient = { patient_id?: string | number; first_name?: string; last_name?: string; smart_code?: string; email?: string; phone?: string; phone_number?: string };
type AkthInvoice = { patient_id?: string | number; invoice_no?: string | number; first_name?: string; last_name?: string; date_issued?: string; status?: string; total_amount?: string | number; smart_code?: string; email?: string; phone?: string; cashier_name?: string };
type AkthItem = { item_id?: string | number; invoice_no?: string | number; item_name?: string; number_of_units?: string | number; cost_per_unit?: string | number; total_amount?: string | number };

@Injectable()
export class AkthHospitalEmrAdapter implements HospitalEmrAdapter {
  private readonly logger = new Logger(AkthHospitalEmrAdapter.name);

  constructor(@Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>) {}

  async getInvoice(invoiceReference: string): Promise<HospitalInvoice> {
    const invoice = await this.requestJson<AkthInvoice>(this.endpoint('Invoice', invoiceReference));
    return this.normalizeInvoice(invoice, invoiceReference, undefined, await this.getItems(invoiceReference));
  }

  async getInvoiceForPatient(input: HospitalPatientInvoiceLookup): Promise<HospitalInvoice> {
    const externalReference = input.externalPatientReference.trim();

    if (!externalReference) throw new BadRequestException('Hospital patient reference is required');

    let patientResponse: unknown = undefined;
    try {
      patientResponse = await this.requestJson<unknown>(this.endpoint('patient', externalReference));
    } catch (error) {
      // AKTH may represent a new/incompletely profiled patient as a 404 or an
      // empty items array. In both cases invoice patient context is the
      // authoritative fallback.
      if (!(error instanceof BadGatewayException && error.message === 'Hospital record was not found')) throw error;
    }
    const patient = this.firstPatient(patientResponse);
    const invoiceReference = input.invoiceReference?.trim() || undefined;

    if (patient && !this.sameIdentity(patient.patient_id, externalReference)) {
      throw new BadGatewayException('Hospital patient identity did not match the connected patient');
    }

    // The confirmed AKTH invoice and item endpoints both require an invoice
    // reference. The patient response contract supplied by AKTH does not
    // define a current-invoice field, so never invent one here.
    if (!invoiceReference) throw new BadRequestException('Hospital invoice reference is required');

    const invoice = await this.requestJson<AkthInvoice>(this.endpoint('Invoice', invoiceReference));
    if (invoice?.patient_id === undefined || invoice?.patient_id === null) {
      throw new BadGatewayException('Hospital invoice response is missing patient identity');
    }
    if (!this.sameIdentity(invoice.patient_id, externalReference) && (!patient || !this.sameIdentity(invoice.patient_id, patient.patient_id))) {
      throw new BadGatewayException('Hospital invoice does not belong to the connected patient');
    }
    const items = await this.getItems(invoiceReference);
    return this.normalizeInvoice(invoice, invoiceReference, patient, items);
  }

  async notifyPayment(input: { invoiceReference: string; paymentReference: string; amount: string; currency: string }): Promise<HospitalPaymentNotificationResult> {
    const settings = this.settings();
    if (!settings.paymentNotificationEndpoint) throw new ServiceUnavailableException('AKTH payment notification is not configured');
    const body = await this.requestJson<any>(settings.paymentNotificationEndpoint, {
      method: 'POST',
      body: JSON.stringify({ invoiceReference: input.invoiceReference, paymentReference: input.paymentReference, amount: input.amount, currency: input.currency }),
    });
    const root = body?.data ?? body;
    return { accepted: root?.success !== false && root?.status !== 'FAILED', reference: root?.reference ?? root?.notificationReference ?? null };
  }

  private async getItems(invoiceReference: string): Promise<AkthItem[]> {
    const body = await this.requestJson<any>(this.endpoint('invoice_item', invoiceReference));
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) throw new BadGatewayException('Hospital invoice items were not found');
    for (const item of items) {
      if (item?.invoice_no !== undefined && !this.sameIdentity(item.invoice_no, invoiceReference)) {
        throw new BadGatewayException('Hospital invoice item does not belong to the requested invoice');
      }
    }
    return items;
  }

  private normalizeInvoice(invoice: AkthInvoice, requestedReference: string, patient: AkthPatient | undefined, rawItems: AkthItem[]): HospitalInvoice {
    if (!invoice || invoice.invoice_no === undefined || invoice.total_amount === undefined || invoice.patient_id === undefined) {
      throw new BadGatewayException('Hospital invoice response is malformed');
    }
    if (!this.sameIdentity(invoice.invoice_no, requestedReference)) {
      throw new BadGatewayException('Hospital invoice reference did not match the requested invoice');
    }
    if (this.toMinor(invoice.total_amount) < 0n) throw new BadGatewayException('Hospital invoice response is malformed');
    const status = String(invoice.status ?? '').trim();
    const payable = this.isPayableStatus(status);
    const items: HospitalInvoiceItem[] = rawItems.map((item) => {
      if (item.item_id === undefined || item.total_amount === undefined || !item.item_name) throw new BadGatewayException('Hospital invoice item response is malformed');
      if (this.toMinor(item.total_amount) < 0n) throw new BadGatewayException('Hospital invoice item response is malformed');
      return { itemReference: String(item.item_id), description: String(item.item_name), amount: String(item.total_amount), payable, numberOfUnits: item.number_of_units === undefined ? null : String(item.number_of_units), costPerUnit: item.cost_per_unit === undefined ? null : String(item.cost_per_unit) };
    });
    const itemTotal = rawItems.reduce((sum, item) => sum + this.toMinor(item.total_amount), 0n);
    if (itemTotal !== this.toMinor(invoice.total_amount)) this.logger.warn('AKTH invoice total differs from item total');
    const context = patient ?? { patient_id: invoice.patient_id, first_name: invoice.first_name, last_name: invoice.last_name, smart_code: invoice.smart_code, email: invoice.email, phone: invoice.phone, phone_number: invoice.phone };
    return {
      invoiceReference: String(invoice.invoice_no ?? requestedReference), currency: 'NGN', date: invoice.date_issued ?? null, total: String(invoice.total_amount), outstanding: payable ? String(invoice.total_amount) : '0',
      patient: { externalReference: String(invoice.patient_id), displayName: [context.first_name, context.last_name].filter(Boolean).join(' ') || null, smartCode: context.smart_code ?? null, email: context.email ?? null, phone: context.phone ?? context.phone_number ?? null }, status: status || null, smartCode: invoice.smart_code ?? null, cashierName: invoice.cashier_name ?? null, items,
    };
  }

  private firstPatient(body: unknown): AkthPatient | undefined {
    const items = (body as any)?.items;
    return Array.isArray(items) && items.length ? items[0] : undefined;
  }

  private isPayableStatus(status: string): boolean {
    // AKTH has confirmed “Process” as the active invoice state. Unknown or
    // closed states remain non-payable until their semantics are confirmed.
    return status.toLowerCase() === 'process';
  }

  private toMinor(value: string | number | undefined): bigint {
    const text = String(value ?? '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return -1n;
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  }

  private sameIdentity(left: string | number | undefined, right: string | number | undefined): boolean {
    if (left === undefined || right === undefined) return false;
    const normalize = (value: string | number): string => {
      const text = String(value).trim();
      const match = text.match(/^(\d+)(?:\.(\d+))?$/);
      if (!match) return text;
      const whole = match[1].replace(/^0+(?=\d)/, '');
      const fraction = (match[2] ?? '').replace(/0+$/, '');
      return fraction ? `${whole}.${fraction}` : whole;
    };
    return normalize(left) === normalize(right);
  }

  private endpoint(resource: string, reference: string): string {
    const base = this.settings().baseUrl?.replace(/\/$/, '');
    if (!base) throw new ServiceUnavailableException('AKTH integration is not configured');
    return `${base}/ords/hms/smartboxhms/${resource}/${encodeURIComponent(reference)}`;
  }

  private settings(): AkthSettings {
    return ((this.config as any).hospitalBills?.akth ?? {}) as AkthSettings;
  }

  private async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout((this.config as any).hospitalBills?.requestTimeoutMs ?? 10000) });
      if (response.status === 404) {
        throw new BadGatewayException('No invoices found for');
      }
      if (!response.ok) throw new BadGatewayException('Hospital EMR request failed with status ' + response.status);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Hospital EMR is temporarily unavailable');
    }
  }
}
