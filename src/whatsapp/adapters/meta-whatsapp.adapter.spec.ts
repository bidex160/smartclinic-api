import { createHmac } from 'node:crypto';
import { MetaWhatsAppAdapter } from './meta-whatsapp.adapter';
import { WhatsAppDeliveryError } from './whatsapp-provider.interface';

const config = (overrides: Record<string, unknown> = {}) => ({ whatsapp: { enabled: true, accessToken: 'secret-token', phoneNumberId: '123456', appSecret: 'app-secret', graphApiBaseUrl: 'https://graph.example.test', graphApiVersion: 'v23.0', sendTimeoutMs: 1000, ...overrides } }) as never;

describe('MetaWhatsAppAdapter', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends the official text request shape without exposing the token in content', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.outbound' }] }) } as Response);
    await expect(new MetaWhatsAppAdapter(config()).sendText({ to: '+2348012345678', text: 'Welcome' })).resolves.toEqual({ providerMessageId: 'wamid.outbound' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.example.test/v23.0/123456/messages');
    expect(JSON.parse(String(init?.body))).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '2348012345678', type: 'text', text: { preview_url: false, body: 'Welcome' } });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('validates signatures and sanitizes provider/configuration failures', async () => {
    const adapter = new MetaWhatsAppAdapter(config()); const raw = Buffer.from('{}');
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
    expect(adapter.verifyWebhookSignature(raw, signature)).toBe(true);
    expect(adapter.verifyWebhookSignature(raw, 'sha256=' + '0'.repeat(64))).toBe(false);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('secret network detail'));
    await expect(adapter.sendText({ to: '+2348012345678', text: 'Welcome' })).rejects.toEqual(new WhatsAppDeliveryError());
    await expect(new MetaWhatsAppAdapter(config({ enabled: false })).sendText({ to: '+2348012345678', text: 'Welcome' })).rejects.toBeInstanceOf(WhatsAppDeliveryError);
  });
});
