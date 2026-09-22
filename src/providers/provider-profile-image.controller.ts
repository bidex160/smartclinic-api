import { Controller, Delete, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { UploadedPrivateFile } from '../common/storage/private-attachment-file';
import { MAX_PROFILE_IMAGE_SIZE, ProviderProfileImageService } from './provider-profile-image.service';

@ApiTags('Provider profile images')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/profile/image')
export class ProviderProfileImageController {
  constructor(private readonly images: ProviderProfileImageService) {}
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PROFILE_IMAGE_SIZE, files: 1, fields: 0 } }))
  upload(@Req() request: { user: User }, @UploadedFile() file?: UploadedPrivateFile) { return this.images.upload(request.user, file); }
  @Delete()
  remove(@Req() request: { user: User }) { return this.images.remove(request.user); }
}
