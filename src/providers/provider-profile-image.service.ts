import { BadRequestException, ForbiddenException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Provider } from './entities/provider.entity';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderConfigurationContextService } from './provider-configuration-context.service';
import { ProviderProfileImageStorage } from './provider-profile-image.storage';
import { UploadedPrivateFile, validatePrivateAttachmentFile } from '../common/storage/private-attachment-file';

export const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
export function validateProfileImage(file?: UploadedPrivateFile) {
  if (!file?.buffer?.length) throw new BadRequestException('Choose a profile image');
  if (file.buffer.length > MAX_PROFILE_IMAGE_SIZE || file.size > MAX_PROFILE_IMAGE_SIZE) throw new PayloadTooLargeException('Profile image must not exceed 5 MB');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Use a JPEG, PNG or WebP image');
  validatePrivateAttachmentFile(file);
  return file;
}

@Injectable()
export class ProviderProfileImageService {
  private readonly logger = new Logger(ProviderProfileImageService.name);
  constructor(@InjectRepository(Provider) private readonly providers: Repository<Provider>, private readonly context: ProviderConfigurationContextService, private readonly storage: ProviderProfileImageStorage) {}
  async upload(user: User, file?: UploadedPrivateFile) {
    await this.context.resolve(user, true);
    const stored = await this.storage.upload(validateProfileImage(file));
    let previous: string | null;
    try { previous = await this.swap(user, stored.url, stored.publicId); }
    catch (error) { await this.cleanup(stored.publicId); throw error; }
    await this.cleanup(previous);
    return { profileImageUrl: stored.url };
  }
  async remove(user: User) {
    await this.context.resolve(user, true);
    const previous = await this.swap(user, null, null);
    await this.cleanup(previous);
    return { profileImageUrl: null };
  }
  private async swap(user: User, url: string | null, key: string | null): Promise<string | null> {
    return this.providers.manager.transaction(async manager => {
      const repo = manager.getRepository(Provider);
      const provider = await repo.findOne({ where: { userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!provider || ![ProviderStatus.PENDING, ProviderStatus.ACTIVE].includes(provider.status)) throw new ForbiddenException('Provider image cannot be changed');
      const previous = provider.profileImagePublicId;
      provider.profileImageUrl = url; provider.profileImagePublicId = key;
      await repo.save(provider);
      this.logger.log(`Provider profile image ${key ? 'updated' : 'removed'}: ${provider.id}; actor ${user.id}`);
      return previous;
    });
  }
  private async cleanup(key?: string | null) {
    if (!key) return;
    try { await this.storage.delete(key); }
    catch { this.logger.warn(`Profile image cleanup requires retry: ${key}`); }
  }
}
