import { BadGatewayException } from '@nestjs/common';
import { AkthHospitalEmrAdapter } from './akth-hospital-emr.adapter';

describe('AkthHospitalEmrAdapter', () => {
  const config = {
    hospitalBills: {
      requestTimeoutMs: 1000,
      akth: { baseUrl: 'https://akth.test', bearerToken: 'secret-token' },
    },
  } as any;
  const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: jest.fn().mockResolvedValue(body) }) as any;

  beforeEach(() => jest.restoreAllMocks());

  it('uses the patient endpoint identity when it is present', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ items: [{ patient_id: '433105.10', first_name: 'Ada', last_name: 'Lovelace' }] }))
      .mockResolvedValueOnce(response({ patient_id: '433105.1', invoice_no: 'INV-1', date_issued: '2026-09-28T14:57:47Z', status: 'Process', total_amount: 600, first_name: 'Ada', last_name: 'Lovelace' }))
      .mockResolvedValueOnce(response({ items: [{ item_id: 7, invoice_no: 'INV-1', item_name: 'Consultation', total_amount: 600 }] }));
    const result = await new AkthHospitalEmrAdapter(config).getInvoiceForPatient({ externalPatientReference: '433105.1', invoiceReference: 'INV-1' });
    expect(result).toMatchObject({ invoiceReference: 'INV-1', currency: 'NGN', total: '600', patient: { externalReference: '433105.1', displayName: 'Ada Lovelace' }, items: [{ itemReference: '7', description: 'Consultation', amount: '600', payable: true }] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://akth.test/ords/hms/smartboxhms/patient/433105.1', 'https://akth.test/ords/hms/smartboxhms/Invoice/INV-1', 'https://akth.test/ords/hms/smartboxhms/invoice_item/INV-1']);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer secret-token' }) }));
  });

  it('falls back to invoice patient context when patient items are empty', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ patient_id: 'AKTH-2', invoice_no: 22, first_name: 'Jamil', last_name: 'Hausa', status: 'Process', total_amount: 600 }))
      .mockResolvedValueOnce(response({ items: [{ item_id: 8, invoice_no: '22', item_name: 'GOPD', total_amount: 600 }] }));
    const result = await new AkthHospitalEmrAdapter(config).getInvoiceForPatient({ externalPatientReference: 'AKTH-2', invoiceReference: '22' });
    expect(result.patient).toMatchObject({ externalReference: 'AKTH-2', displayName: 'Jamil Hausa' });
  });

  it('falls back when the patient endpoint returns 404 without discovering another invoice', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({}, false, 404))
      .mockResolvedValueOnce(response({ patient_id: 'AKTH-2', invoice_no: 22, first_name: 'Jamil', last_name: 'Hausa', status: 'Process', total_amount: 600 }))
      .mockResolvedValueOnce(response({ items: [{ item_id: 8, invoice_no: '22', item_name: 'GOPD', total_amount: 600 }] }));
    const result = await new AkthHospitalEmrAdapter(config).getInvoiceForPatient({ externalPatientReference: 'AKTH-2', invoiceReference: '22' });
    expect(result.invoiceReference).toBe('22');
  });

  it('requires the supplied invoice reference rather than a current-invoice lookup', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ items: [{ patient_id: 'AKTH-1' }] }));
    await expect(new AkthHospitalEmrAdapter(config).getInvoiceForPatient({ externalPatientReference: 'AKTH-1' })).rejects.toThrow('Hospital invoice reference is required');
  });

  it('marks unknown invoice statuses as non-payable', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ patient_id: 'AKTH-2', invoice_no: 22, status: 'Closed', total_amount: 600 }))
      .mockResolvedValueOnce(response({ items: [{ item_id: 8, invoice_no: '22', item_name: 'GOPD', total_amount: 600 }] }));
    const result = await new AkthHospitalEmrAdapter(config).getInvoiceForPatient({ externalPatientReference: 'AKTH-2', invoiceReference: '22' });
    expect(result.items[0].payable).toBe(false);
  });

  it('rejects invoice item references that do not belong to the invoice', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ patient_id: 'AKTH-1' }))
      .mockResolvedValueOnce(response({ patient_id: 'AKTH-1', invoice_no: 'INV-1', status: 'Process', total_amount: 10 }))
      .mockResolvedValueOnce(response({ items: [{ item_id: 8, invoice_no: 'OTHER', item_name: 'Wrong', total_amount: 10 }] }));
    await expect(new AkthHospitalEmrAdapter(config).getInvoiceForPatient({ externalPatientReference: 'AKTH-1', invoiceReference: 'INV-1' })).rejects.toThrow(BadGatewayException);
  });
});
