import { Global, Module } from '@nestjs/common';
import { CloudinaryPrivateAttachmentStorage } from './cloudinary-private-attachment.storage';
import { PRIVATE_ATTACHMENT_STORAGE } from './private-attachment-storage';
@Global() @Module({ providers: [CloudinaryPrivateAttachmentStorage, { provide: PRIVATE_ATTACHMENT_STORAGE, useExisting: CloudinaryPrivateAttachmentStorage }], exports: [PRIVATE_ATTACHMENT_STORAGE] })
export class PrivateAttachmentStorageModule {}
