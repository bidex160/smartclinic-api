import { createHash, randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createAppConfiguration } from '../config/environment';

@Injectable()
export class ProviderProfileImageStorage {
  private readonly config = createAppConfiguration().clinicalAttachments;
  private signature(params: Record<string, string>) {
    return createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + this.config.apiSecret).digest('hex');
  }
  private async request(action: string, params: Record<string, string>, file?: { buffer: Buffer; mimetype: string }) {
    if (this.config.provider !== 'cloudinary' || !this.config.cloudName || !this.config.apiKey || !this.config.apiSecret) throw new ServiceUnavailableException('Profile image storage is not configured');
    const signed = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
    const body = new FormData();
    for (const [key, value] of Object.entries(signed)) body.set(key, value);
    body.set('api_key', this.config.apiKey); body.set('signature', this.signature(signed));
    if (file) body.set('file', new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }));
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName)}/image/${action}`, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('storage rejected request');
      return await response.json() as Record<string, unknown>;
    } catch { throw new ServiceUnavailableException('Profile image storage is unavailable'); }
  }
  async upload(file: { buffer: Buffer; mimetype: string }) {
    const publicId = `smartclinic/provider-profiles/${randomUUID()}`;
    const result = await this.request('upload', { public_id: publicId, type: 'upload', overwrite: 'false', transformation: 'c_limit,w_600,h_600', format: 'png' }, file);
    if (result.public_id !== publicId || typeof result.secure_url !== 'string' || !result.secure_url.startsWith('https://res.cloudinary.com/') || result.resource_type !== 'image' || result.format !== 'png') throw new ServiceUnavailableException('Profile image storage returned an invalid image');
    return { publicId, url: result.secure_url };
  }
  async delete(publicId: string) {
    if (!publicId.startsWith('smartclinic/provider-profiles/')) throw new ServiceUnavailableException('Invalid profile image storage key');
    const result = await this.request('destroy', { public_id: publicId, type: 'upload', invalidate: 'true' });
    if (!['ok', 'not found'].includes(String(result.result))) throw new ServiceUnavailableException('Profile image removal failed');
  }
}
