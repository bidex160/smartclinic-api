import { BadRequestException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import { ProviderProfileImageService, validateProfileImage } from './provider-profile-image.service';
const file = () => ({ originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 4, buffer: Buffer.from([255, 216, 255, 0]) });
describe('Provider profile image ownership and lifecycle', () => {
  function setup() {
    const provider = { id: 'provider-1', userId: 'user-1', status: 'ACTIVE', profileImageUrl: 'https://old', profileImagePublicId: 'old-key' };
    const repo = { findOne: jest.fn().mockResolvedValue(provider), save: jest.fn().mockResolvedValue(provider) };
    const manager = { getRepository: () => repo };
    const providers = { manager: { transaction: (fn: Function) => fn(manager) } };
    const context = { resolve: jest.fn().mockResolvedValue(provider) };
    const storage = { upload: jest.fn().mockResolvedValue({ publicId: 'new-key', url: 'https://new' }), delete: jest.fn().mockResolvedValue(undefined) };
    const service = new ProviderProfileImageService(providers as any, context as any, storage as any);
    return { service, provider, repo, context, storage, user: { id: 'user-1' } as any };
  }
  it('rejects empty files, disguised SVG and oversized buffer bytes', () => {
    expect(() => validateProfileImage()).toThrow(BadRequestException);
    expect(() => validateProfileImage({ ...file(), buffer: Buffer.from('<svg>') })).toThrow(BadRequestException);
    expect(() => validateProfileImage({ ...file(), mimetype: 'image/svg+xml' })).toThrow(BadRequestException);
    expect(() => validateProfileImage({ ...file(), buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })).toThrow(PayloadTooLargeException);
  });
  it('checks provider eligibility before storage upload', async () => {
    const { service, context, storage, user } = setup(); context.resolve.mockRejectedValue(new ForbiddenException());
    await expect(service.upload(user, file())).rejects.toThrow(ForbiddenException);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('locks only the authenticated provider and removes the previous image after saving', async () => {
    const { service, repo, storage, user } = setup();
    await expect(service.upload(user, file())).resolves.toEqual({ profileImageUrl: 'https://new' });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, lock: { mode: 'pessimistic_write' } });
    expect(storage.delete).toHaveBeenCalledWith('old-key');
    expect(repo.save.mock.invocationCallOrder[0]).toBeLessThan(storage.delete.mock.invocationCallOrder[0]);
  });
  it('rechecks suspension inside the transaction and cleans the unlinked upload', async () => {
    const { service, provider, storage, repo, user } = setup(); provider.status = 'SUSPENDED';
    await expect(service.upload(user, file())).rejects.toThrow(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled(); expect(storage.delete).toHaveBeenCalledWith('new-key');
    expect(storage.delete).not.toHaveBeenCalledWith('old-key');
  });
  it('keeps the old storage object if the database write fails', async () => {
    const { service, repo, storage, user } = setup(); repo.save.mockRejectedValue(new Error('database unavailable'));
    await expect(service.upload(user, file())).rejects.toThrow('database unavailable');
    expect(storage.delete).toHaveBeenCalledWith('new-key'); expect(storage.delete).not.toHaveBeenCalledWith('old-key');
  });
  it('removes the reference and invalidates the old public image', async () => {
    const { service, repo, storage, user } = setup();
    await expect(service.remove(user)).resolves.toEqual({ profileImageUrl: null });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ profileImageUrl: null, profileImagePublicId: null }));
    expect(storage.delete).toHaveBeenCalledWith('old-key');
  });
});
