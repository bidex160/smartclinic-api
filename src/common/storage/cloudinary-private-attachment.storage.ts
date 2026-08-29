import { createHash, randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createAppConfiguration } from '../../config/environment';
import { PrivateAttachmentResourceType, PrivateAttachmentStorage, PrivateAttachmentUpload, StoredPrivateAttachment } from './private-attachment-storage';

@Injectable()
export class CloudinaryPrivateAttachmentStorage implements PrivateAttachmentStorage {
  private readonly config = createAppConfiguration().clinicalAttachments;
  async upload(file: PrivateAttachmentUpload): Promise<StoredPrivateAttachment> {
    this.requireConfigured(); const storageResourceType = file.resourceType === PrivateAttachmentResourceType.IMAGE ? 'image' : 'raw';
    const publicId = `smartclinic/${file.namespace}/${randomUUID().replaceAll('-', '')}`; const timestamp = Math.floor(Date.now() / 1000);
    const params = { public_id: publicId, timestamp: String(timestamp), type: 'authenticated' }; const form = new FormData();
    form.set('file', new Blob([Uint8Array.from(file.buffer)], { type: file.mimeType })); form.set('api_key', this.config.apiKey!); form.set('public_id', publicId); form.set('timestamp', String(timestamp)); form.set('type', 'authenticated'); form.set('signature', this.apiSignature(params));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName!)}/${storageResourceType}/upload`, { method: 'POST', body: form });
    if (!response.ok) throw new ServiceUnavailableException('Private attachment storage upload failed');
    const result = await response.json() as { public_id: string; version?: number; format?: string; resource_type: string }; const fallback: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    return { publicId: result.public_id, storageResourceType: result.resource_type, version: result.version == null ? null : String(result.version), format: result.format ?? fallback[file.mimeType] };
  }
  async delete(file: StoredPrivateAttachment) { this.requireConfigured(); const timestamp = Math.floor(Date.now() / 1000); const params = { invalidate: 'true', public_id: file.publicId, timestamp: String(timestamp), type: 'authenticated' }; const body = new URLSearchParams({ ...params, api_key: this.config.apiKey!, signature: this.apiSignature(params) }); const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName!)}/${file.storageResourceType}/destroy`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }); if (!response.ok) throw new ServiceUnavailableException('Private attachment storage deletion failed'); }
  async createAccessUrl(file: StoredPrivateAttachment, expiresAt: Date) { this.requireConfigured(); if (!file.format) throw new ServiceUnavailableException('Private attachment storage format is unavailable'); const timestamp = Math.floor(Date.now() / 1000); const params = { expires_at: String(Math.floor(expiresAt.getTime() / 1000)), format: file.format, public_id: file.publicId, timestamp: String(timestamp), type: 'authenticated' }; const query = new URLSearchParams({ ...params, api_key: this.config.apiKey!, signature: this.apiSignature(params) }); return `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName!)}/${file.storageResourceType}/download?${query}`; }
  private apiSignature(params: Record<string, string>) { return createHash('sha1').update(`${Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&')}${this.config.apiSecret}`).digest('hex'); }
  private requireConfigured() { if (this.config.provider !== 'cloudinary' || !this.config.cloudName || !this.config.apiKey || !this.config.apiSecret) throw new ServiceUnavailableException('Private attachment storage is not configured'); }
}
