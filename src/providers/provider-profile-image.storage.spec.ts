import { ProviderProfileImageStorage } from './provider-profile-image.storage';
jest.mock('../config/environment', () => ({ createAppConfiguration: () => ({ clinicalAttachments: { provider: 'cloudinary', cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' } }) }));
describe('Public provider image storage boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  it('normalizes images in the dedicated public namespace without changing clinical storage', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
      const form = options?.body as FormData;
      expect(form.get('type')).toBe('upload'); expect(form.get('format')).toBe('png');
      expect(form.get('transformation')).toBe('c_limit,w_600,h_600'); expect(form.get('signature')).toEqual(expect.any(String));
      expect(form.get('public_id')).toMatch(/^smartclinic\/provider-profiles\//);
      return { ok: true, json: async () => ({ public_id: form.get('public_id'), resource_type: 'image', format: 'png', secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/photo.png' }) } as Response;
    });
    const result = await new ProviderProfileImageStorage().upload({ buffer: Buffer.from('test'), mimetype: 'image/png' });
    expect(result.url).toMatch(/^https:\/\/res.cloudinary.com\//); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('refuses to delete clinical attachments or arbitrary keys', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(new ProviderProfileImageStorage().delete('smartclinic/clinical-records/private')).rejects.toThrow('Invalid profile image');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requests cache invalidation when deleting a public image', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
      const form = options?.body as FormData;
      expect(form.get('invalidate')).toBe('true'); expect(form.get('type')).toBe('upload');
      return { ok: true, json: async () => ({ result: 'ok' }) } as Response;
    });
    await expect(new ProviderProfileImageStorage().delete('smartclinic/provider-profiles/test')).resolves.toBeUndefined();
  });
});
