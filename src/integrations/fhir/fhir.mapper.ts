/**
 * Translates between FHIR R4 JSON and SmartClinic's direct clinical orders.
 *
 * SmartClinic stays the source of truth: these are pure functions over the
 * same views and DTOs the provider portal and the REST integration API use,
 * so consent, privacy and approval rules apply unchanged.
 */
import { BadRequestException } from '@nestjs/common';

import { ClinicalOrderType } from '../../clinical-orders/enums/clinical-order-type.enum';

export const FHIR_BASE = 'https://smartclinicnetwork.com/fhir';
export const SYSTEM = {
  smartClinicId: `${FHIR_BASE}/sid/smartclinic-id`,
  order: `${FHIR_BASE}/sid/clinical-order`,
  provider: `${FHIR_BASE}/sid/provider`,
  catalogue: `${FHIR_BASE}/CodeSystem/catalogue`,
  requestType: `${FHIR_BASE}/CodeSystem/request-type`,
  patientResponse: `${FHIR_BASE}/StructureDefinition/patient-response`,
  fulfillment: `${FHIR_BASE}/StructureDefinition/fulfillment`,
  snomed: 'http://snomed.info/sct',
  interpretation: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
} as const;

export type FhirResource = { resourceType: string; [key: string]: unknown };
type DirectType =
  | ClinicalOrderType.PRESCRIPTION
  | ClinicalOrderType.LABORATORY
  | ClinicalOrderType.IMAGING
  | ClinicalOrderType.REFERRAL;

/** SNOMED CT categories, the usual way EMRs label a ServiceRequest. */
const CATEGORY: Record<Exclude<DirectType, ClinicalOrderType.PRESCRIPTION>, { code: string; display: string; own: string }> = {
  [ClinicalOrderType.LABORATORY]: { code: '108252007', display: 'Laboratory procedure', own: 'laboratory' },
  [ClinicalOrderType.IMAGING]: { code: '363679005', display: 'Imaging', own: 'imaging' },
  [ClinicalOrderType.REFERRAL]: { code: '3457005', display: 'Patient referral', own: 'referral' },
};

/** The shape ClinicalOrdersService returns to a provider. */
export interface OrderView {
  reference: string;
  patient?: { patientReference: string; displayName: string };
  type: string;
  status: string;
  clinicalNote: string | null;
  orderingProvider: { providerReference: string; displayName: string; providerType: string };
  patientResponse: string | null;
  issuedAt: string | Date | null;
  cancelledAt: string | Date | null;
  cancellationReason: string | null;
  diagnosticItems: Array<{
    name: string;
    code: string | null;
    instructions: string | null;
    resultText: string | null;
    resultValue: string | null;
    resultUnit: string | null;
    referenceRange: string | null;
    resultFlag: string | null;
    resultedAt: string | Date | null;
  }>;
  prescription: null | {
    notes: string | null;
    items: Array<{
      medicationName: string;
      strength: string | null;
      dosage: string;
      frequency: string;
      duration: string | null;
      quantity: string | null;
      route: string | null;
      instructions: string | null;
    }>;
  };
  createdAt: string | Date;
  updatedAt: string | Date;
  fulfillment?: { reference: string; status: string; serviceUnit?: { providerReference: string; displayName: string } } | null;
}

/** The body ClinicalOrdersService.createDirect accepts. */
export interface DirectOrderInput {
  patientReference: string;
  type: DirectType;
  clinicalNote?: string | null;
  prescriptionItems?: Array<Record<string, string | null>>;
  diagnosticItems?: Array<{ name: string; code?: string | null; instructions?: string | null }>;
}

const iso = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : undefined);
const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length))) as T;
const bad = (message: string): never => {
  throw new BadRequestException(message);
};
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- reading

export function patientResource(p: { patientReference: string; displayName: string }): FhirResource {
  return {
    resourceType: 'Patient',
    id: p.patientReference,
    identifier: [{ system: SYSTEM.smartClinicId, value: p.patientReference }],
    // Only what the patient has agreed to share: a first name and initial until they approve a request.
    name: [{ text: p.displayName }],
  };
}

export function organizationResource(o: { providerReference: string; displayName: string; providerType?: string }): FhirResource {
  return clean({
    resourceType: 'Organization',
    id: o.providerReference,
    identifier: [{ system: SYSTEM.provider, value: o.providerReference }],
    name: o.displayName,
    type: o.providerType ? [{ text: o.providerType.replaceAll('_', ' ').toLowerCase() }] : undefined,
  });
}

function subject(o: OrderView) {
  return o.patient
    ? { reference: `Patient/${o.patient.patientReference}`, identifier: { system: SYSTEM.smartClinicId, value: o.patient.patientReference }, display: o.patient.displayName }
    : undefined;
}
function requester(o: OrderView) {
  return { reference: `Organization/${o.orderingProvider.providerReference}`, display: o.orderingProvider.displayName };
}
function extensions(o: OrderView) {
  return [
    o.patientResponse ? { url: SYSTEM.patientResponse, valueCode: o.patientResponse.toLowerCase() } : undefined,
    o.fulfillment ? { url: SYSTEM.fulfillment, valueString: o.fulfillment.status.toLowerCase() } : undefined,
  ].filter(Boolean);
}
function performer(o: OrderView) {
  const unit = o.fulfillment?.serviceUnit;
  return unit ? [{ reference: `Organization/${unit.providerReference}`, display: unit.displayName }] : undefined;
}
const resulted = (o: OrderView) => o.diagnosticItems.length > 0 && o.diagnosticItems.every((i) => i.resultedAt);
const codeable = (name: string, code?: string | null) =>
  clean({ text: name, coding: code ? [{ system: SYSTEM.catalogue, code, display: name }] : undefined });

export function serviceRequestStatus(o: OrderView): string {
  if (o.status === 'CANCELLED') return 'revoked';
  if (o.status === 'DRAFT') return 'draft';
  return resulted(o) ? 'completed' : 'active';
}

export function serviceRequestResource(o: OrderView): FhirResource {
  if (o.type === ClinicalOrderType.PRESCRIPTION) bad(`${o.reference} is a prescription; read it as MedicationRequest`);
  const category = CATEGORY[o.type as keyof typeof CATEGORY];
  const [first, ...rest] = o.diagnosticItems;
  return clean({
    resourceType: 'ServiceRequest',
    id: o.reference,
    meta: { lastUpdated: iso(o.updatedAt) },
    extension: extensions(o),
    identifier: [{ system: SYSTEM.order, value: o.reference }],
    requisition: { system: SYSTEM.order, value: o.reference },
    status: serviceRequestStatus(o),
    intent: 'order',
    category: category
      ? [{ coding: [{ system: SYSTEM.snomed, code: category.code, display: category.display }, { system: SYSTEM.requestType, code: category.own }], text: category.display }]
      : undefined,
    code: first ? codeable(first.name, first.code) : { text: 'Specialist referral' },
    orderDetail: rest.map((i) => codeable(i.name, i.code)),
    subject: subject(o),
    authoredOn: iso(o.issuedAt ?? o.createdAt),
    requester: requester(o),
    performer: performer(o),
    reasonCode: o.type === ClinicalOrderType.REFERRAL && o.clinicalNote ? [{ text: o.clinicalNote }] : undefined,
    note: o.clinicalNote && o.type !== ClinicalOrderType.REFERRAL ? [{ text: o.clinicalNote }] : undefined,
    patientInstruction: o.diagnosticItems.map((i) => i.instructions).filter(Boolean).join('\n') || undefined,
  });
}

export function medicationRequestResources(o: OrderView): FhirResource[] {
  if (o.type !== ClinicalOrderType.PRESCRIPTION) bad(`${o.reference} is not a prescription; read it as ServiceRequest`);
  const status = o.status === 'CANCELLED' ? 'cancelled' : o.status === 'DRAFT' ? 'draft' : 'active';
  return (o.prescription?.items ?? []).map((item, index) =>
    clean({
      resourceType: 'MedicationRequest',
      id: `${o.reference}-${index + 1}`,
      meta: { lastUpdated: iso(o.updatedAt) },
      extension: extensions(o),
      identifier: [{ system: SYSTEM.order, value: `${o.reference}-${index + 1}` }],
      groupIdentifier: { system: SYSTEM.order, value: o.reference },
      status,
      intent: 'order',
      medicationCodeableConcept: { text: [item.medicationName, item.strength].filter(Boolean).join(' ') },
      subject: subject(o),
      authoredOn: iso(o.issuedAt ?? o.createdAt),
      requester: requester(o),
      performer: performer(o)?.[0],
      note: o.clinicalNote ? [{ text: o.clinicalNote }] : undefined,
      dosageInstruction: [
        clean({
          text: [item.dosage, item.frequency].filter(Boolean).join(', '),
          timing: { code: { text: item.frequency } },
          route: item.route ? { text: item.route } : undefined,
          patientInstruction: item.instructions ?? undefined,
        }),
      ],
      dispenseRequest: clean({
        quantity: item.quantity ? { unit: item.quantity } : undefined,
        expectedSupplyDuration: item.duration ? { unit: item.duration } : undefined,
      }),
    }),
  );
}

const INTERPRETATION: Record<string, string> = { HIGH: 'H', H: 'H', LOW: 'L', L: 'L', NORMAL: 'N', N: 'N', ABNORMAL: 'A', A: 'A', CRITICAL: 'AA', 'CRITICAL HIGH': 'HH', 'CRITICAL LOW': 'LL' };

/** One report per lab or imaging request; each item becomes a contained Observation. */
export function diagnosticReportResource(o: OrderView): FhirResource {
  if (o.type !== ClinicalOrderType.LABORATORY && o.type !== ClinicalOrderType.IMAGING) bad(`${o.reference} has no diagnostic report`);
  const done = o.diagnosticItems.filter((i) => i.resultedAt);
  const observations = done.map((i, index) => {
    const numeric = i.resultValue !== null && i.resultValue !== '' && !Number.isNaN(Number(i.resultValue));
    const flag = i.resultFlag ? INTERPRETATION[i.resultFlag.trim().toUpperCase()] : undefined;
    return clean({
      resourceType: 'Observation',
      id: `obs-${index + 1}`,
      status: 'final',
      code: codeable(i.name, i.code),
      subject: subject(o),
      effectiveDateTime: iso(i.resultedAt),
      valueQuantity: numeric ? clean({ value: Number(i.resultValue), unit: i.resultUnit ?? undefined }) : undefined,
      valueString: !numeric ? (i.resultValue ?? i.resultText ?? undefined) : undefined,
      interpretation: flag ? [{ coding: [{ system: SYSTEM.interpretation, code: flag }], text: i.resultFlag }] : undefined,
      referenceRange: i.referenceRange ? [{ text: i.referenceRange }] : undefined,
      note: numeric && i.resultText ? [{ text: i.resultText }] : undefined,
    });
  });
  const category = CATEGORY[o.type as keyof typeof CATEGORY];
  return clean({
    resourceType: 'DiagnosticReport',
    id: o.reference,
    contained: observations,
    basedOn: [{ reference: `ServiceRequest/${o.reference}` }],
    status: o.status === 'CANCELLED' ? 'cancelled' : !done.length ? 'registered' : done.length < o.diagnosticItems.length ? 'partial' : 'final',
    category: [{ coding: [{ system: SYSTEM.snomed, code: category.code, display: category.display }] }],
    code: { text: o.diagnosticItems.map((i) => i.name).join(', ') },
    subject: subject(o),
    issued: done.length ? iso(done.map((i) => new Date(i.resultedAt as string).getTime()).sort().map((t) => new Date(t)).pop()) : undefined,
    performer: performer(o),
    result: observations.map((obs) => ({ reference: `#${obs.id}` })),
  });
}

export function searchBundle(resources: FhirResource[], total: number, self: string, next?: string): FhirResource {
  return clean({
    resourceType: 'Bundle',
    type: 'searchset',
    total,
    link: [{ relation: 'self', url: self }, next ? { relation: 'next', url: next } : undefined].filter(Boolean),
    entry: resources.map((resource) => ({ fullUrl: `${resource.resourceType}/${resource.id}`, resource, search: { mode: 'match' } })),
  });
}

export function operationOutcome(severity: 'error' | 'information', code: string, messages: string[]): FhirResource {
  return { resourceType: 'OperationOutcome', issue: messages.map((diagnostics) => ({ severity, code, diagnostics })) };
}

// ---------------------------------------------------------------- writing

/** "Patient/SCP-ABCD-1234", an identifier, or a bare reference. */
export function patientReferenceFrom(resource: Record<string, any>): string {
  const ref = resource.subject?.identifier?.value ?? resource.subject?.reference?.replace(/^Patient\//, '');
  return text(ref) ?? bad('Set subject to the patient: {"reference": "Patient/SCP-ABCD-1234"} or {"identifier": {"value": "SCP-ABCD-1234"}}');
}

function requestTypeFrom(sr: Record<string, any>): Exclude<DirectType, ClinicalOrderType.PRESCRIPTION> {
  for (const cat of asArray(sr.category)) {
    for (const c of asArray(cat.coding)) {
      for (const [type, def] of Object.entries(CATEGORY)) {
        if ((c.system === SYSTEM.snomed && c.code === def.code) || (c.system === SYSTEM.requestType && c.code === def.own)) return type as any;
      }
    }
    const t = String(cat.text ?? '').toLowerCase();
    if (/lab/.test(t)) return ClinicalOrderType.LABORATORY;
    if (/imag|radiolog|x-?ray|scan/.test(t)) return ClinicalOrderType.IMAGING;
    if (/referr/.test(t)) return ClinicalOrderType.REFERRAL;
  }
  return bad('Set ServiceRequest.category to laboratory (SNOMED 108252007), imaging (363679005) or referral (3457005)');
}

function itemFrom(cc: Record<string, any> | undefined) {
  if (!cc) return undefined;
  const coding = asArray(cc.coding)[0] ?? {};
  const name = text(cc.text) ?? text(coding.display) ?? text(coding.code);
  if (!name) return undefined;
  return clean({ name, code: coding.system === SYSTEM.catalogue ? text(coding.code) : undefined });
}

function notesFrom(r: Record<string, any>): string | undefined {
  return [...asArray(r.reasonCode).map((x) => text(x.text) ?? text(asArray(x.coding)[0]?.display)), ...asArray(r.note).map((n) => text(n.text))]
    .filter(Boolean)
    .join('\n') || undefined;
}

/** ServiceRequests for the same patient, type and requisition become one SmartClinic request. */
export function directOrderFromServiceRequests(requests: Record<string, any>[]): DirectOrderInput {
  const first = requests[0];
  const type = requestTypeFrom(first);
  const patientReference = patientReferenceFrom(first);
  const clinicalNote = requests.map(notesFrom).filter(Boolean).join('\n') || undefined;
  if (type === ClinicalOrderType.REFERRAL) {
    return clean({ patientReference, type, clinicalNote: clinicalNote ?? text(first.code?.text) ?? bad('A referral needs its reason in reasonCode or note') }) as DirectOrderInput;
  }
  const diagnosticItems = requests.flatMap((sr) => {
    const items = [itemFrom(sr.code), ...asArray(sr.orderDetail).map(itemFrom)].filter(Boolean) as Array<{ name: string; code?: string }>;
    const instructions = text(sr.patientInstruction);
    return items.map((i) => clean({ ...i, instructions }));
  });
  if (!diagnosticItems.length) bad('Name the test in ServiceRequest.code.text (or code.coding.display)');
  return clean({ patientReference, type, clinicalNote, diagnosticItems }) as DirectOrderInput;
}

/** MedicationRequests sharing a groupIdentifier become one prescription. */
export function directOrderFromMedicationRequests(requests: Record<string, any>[]): DirectOrderInput {
  const patientReference = patientReferenceFrom(requests[0]);
  const prescriptionItems = requests.map((mr) => {
    const med = mr.medicationCodeableConcept ?? {};
    const medicationName = text(med.text) ?? text(asArray(med.coding)[0]?.display) ?? bad('Name the medicine in medicationCodeableConcept.text');
    const dose = asArray(mr.dosageInstruction)[0] ?? {};
    const frequency = text(dose.timing?.code?.text) ?? text(asArray(dose.timing?.code?.coding)[0]?.display) ?? text(dose.text) ?? bad(`Give a frequency for ${medicationName} in dosageInstruction[0].timing.code.text`);
    const dosage = text(dose.text) ?? text(dose.doseAndRate?.[0]?.doseQuantity && `${dose.doseAndRate[0].doseQuantity.value ?? ''} ${dose.doseAndRate[0].doseQuantity.unit ?? ''}`) ?? bad(`Give a dose for ${medicationName} in dosageInstruction[0].text`);
    const quantity = mr.dispenseRequest?.quantity;
    const duration = mr.dispenseRequest?.expectedSupplyDuration;
    return clean({
      medicationName,
      dosage,
      frequency,
      route: text(dose.route?.text) ?? text(asArray(dose.route?.coding)[0]?.display),
      instructions: text(dose.patientInstruction),
      quantity: quantity ? text(`${quantity.value ?? ''} ${quantity.unit ?? ''}`) : undefined,
      duration: duration ? text(`${duration.value ?? ''} ${duration.unit ?? ''}`) : undefined,
    });
  });
  const clinicalNote = requests.map((r) => asArray(r.note).map((n) => text(n.text)).filter(Boolean).join('\n')).filter(Boolean).join('\n') || undefined;
  return clean({ patientReference, type: ClinicalOrderType.PRESCRIPTION, clinicalNote, prescriptionItems }) as DirectOrderInput;
}

/** Groups a Bundle's requests into SmartClinic requests, keeping each entry's position. */
export function groupBundleEntries(bundle: Record<string, any>): Array<{ kind: 'ServiceRequest' | 'MedicationRequest'; entries: number[]; resources: Record<string, any>[] }> {
  if (bundle.resourceType !== 'Bundle' || !['batch', 'transaction'].includes(bundle.type)) bad('POST a Bundle with type "batch" or "transaction"');
  const groups = new Map<string, { kind: 'ServiceRequest' | 'MedicationRequest'; entries: number[]; resources: Record<string, any>[] }>();
  asArray(bundle.entry).forEach((entry, index) => {
    const r = entry?.resource;
    if (!r || !['ServiceRequest', 'MedicationRequest'].includes(r.resourceType)) bad(`Entry ${index + 1}: only ServiceRequest and MedicationRequest can be sent`);
    const group = r.resourceType === 'ServiceRequest' ? r.requisition?.value : r.groupIdentifier?.value;
    const key = [r.resourceType, patientReferenceFrom(r), r.resourceType === 'ServiceRequest' ? requestTypeFrom(r) : 'rx', group ?? `entry-${index}`].join('|');
    const g = groups.get(key) ?? { kind: r.resourceType as 'ServiceRequest' | 'MedicationRequest', entries: [] as number[], resources: [] as Record<string, any>[] };
    g.entries.push(index);
    g.resources.push(r);
    groups.set(key, g);
  });
  if (!groups.size) bad('The Bundle has no entries');
  if (asArray(bundle.entry).length > 60) bad('Send at most 60 entries per Bundle');
  return [...groups.values()];
}

export function capabilityStatement(baseUrl: string): FhirResource {
  const interactions = (...codes: string[]) => codes.map((code) => ({ code }));
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: '2026-10-02',
    publisher: 'SmartClinic',
    kind: 'instance',
    software: { name: 'SmartClinic FHIR API', version: '1.0.0' },
    implementation: { description: 'SmartClinic health exchange', url: baseUrl },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'json'],
    rest: [
      {
        mode: 'server',
        documentation:
          'Authenticate with a facility API key: "Authorization: Bearer sck_…". A key acts as the facility, with the same consent and privacy rules as the SmartClinic portal. Patients are addressed by their SmartClinic ID and approve each request in the app before the facility sees more than a first name and initial.',
        security: { description: 'Facility API keys are created in Provider portal → Integrations. Each is shown once and stored hashed.' },
        resource: [
          { type: 'Patient', interaction: interactions('read', 'search-type'), searchParam: [{ name: 'identifier', type: 'token' }] },
          { type: 'Organization', interaction: interactions('read') },
          {
            type: 'ServiceRequest',
            interaction: interactions('read', 'create', 'search-type'),
            searchParam: [{ name: '_count', type: 'number' }, { name: '_page', type: 'number' }],
            operation: [{ name: 'cancel', definition: `${FHIR_BASE}/OperationDefinition/cancel` }],
          },
          { type: 'MedicationRequest', interaction: interactions('read', 'create', 'search-type'), searchParam: [{ name: 'group-identifier', type: 'token' }] },
          { type: 'DiagnosticReport', interaction: interactions('read', 'search-type'), searchParam: [{ name: 'based-on', type: 'reference' }] },
        ],
        interaction: [{ code: 'batch' }, { code: 'transaction' }],
      },
    ],
  };
}
