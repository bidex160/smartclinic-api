export interface HospitalInvoiceItem {
  itemReference: string;
  description: string;
  amount: string;
  payable: boolean;
  numberOfUnits?: string | null;
  costPerUnit?: string | null;
}

export interface HospitalInvoice {
  invoiceReference?: string;
  currency: string;
  items: HospitalInvoiceItem[];
  date?: string | null;
  total?: string | null;
  outstanding?: string | null;
  patient?: {
    externalReference: string;
    displayName: string | null;
    smartCode?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  status?: string | null;
  smartCode?: string | null;
  cashierName?: string | null;
}

export interface HospitalPatientInvoiceLookup {
  externalPatientReference: string;
  invoiceReference?: string;
}

export interface HospitalPaymentNotificationResult {
  accepted: boolean;
  reference: string | null;
}

export interface HospitalEmrAdapter {
  getInvoice(invoiceReference: string): Promise<HospitalInvoice>;
  getInvoiceForPatient(input: HospitalPatientInvoiceLookup): Promise<HospitalInvoice>;
  notifyPayment(input: { invoiceReference: string; paymentReference: string; amount: string; currency: string }): Promise<HospitalPaymentNotificationResult>;
}

export const HOSPITAL_EMR_ADAPTER = Symbol('HOSPITAL_EMR_ADAPTER');
