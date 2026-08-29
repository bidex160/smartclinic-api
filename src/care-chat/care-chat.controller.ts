import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CareRequestReferenceParamsDto } from "../care-requests/dto/care-request.dto";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { CareChatService } from "./care-chat.service";
import {
  CareMessageListQueryDto,
  SendCareMessageDto,
  CareMessageAttachmentAccessParamsDto,
} from "./dto/care-chat.dto";
import { UploadedPrivateFile } from '../common/storage/private-attachment-file';

@ApiTags("My Care Chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/care-requests/:reference/chat")
export class MeCareChatController {
  constructor(private readonly chat: CareChatService) {}
  @Get()
  @ApiOperation({ summary: "Open the authenticated patient Care Chat" })
  open(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
  ) {
    return this.chat.openPatient(req.user, params.reference);
  }
  @Get("messages") messages(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
    @Query() query: CareMessageListQueryDto,
  ) {
    return this.chat.messagesPatient(req.user, params.reference, query);
  }
  @Post("messages") send(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
    @Body() dto: SendCareMessageDto,
  ) {
    return this.chat.sendPatient(req.user, params.reference, dto.body, dto.attachmentReferences);
  }
  @Post('attachments') @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } }) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  upload(@Req() req: { user: User }, @Param() params: CareRequestReferenceParamsDto, @UploadedFile() file?: UploadedPrivateFile) { return this.chat.uploadPatient(req.user, params.reference, file); }
  @Get('messages/:messageReference/attachments/:attachmentReference/access') access(@Req() req: { user: User }, @Param() params: CareMessageAttachmentAccessParamsDto) { return this.chat.accessPatient(req.user, params.reference, params.messageReference, params.attachmentReference); }
  @Post("read")
  @ApiOperation({ summary: "Mark Provider messages in this Care Chat as read" })
  read(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
  ) {
    return this.chat.readPatient(req.user, params.reference);
  }
}

@ApiTags("Provider Care Chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller("provider/care-requests/:reference/chat")
export class ProviderCareChatController {
  constructor(private readonly chat: CareChatService) {}
  @Get() @ApiOperation({ summary: "Open an assigned Provider Care Chat" }) open(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
  ) {
    return this.chat.openProvider(req.user, params.reference);
  }
  @Get("messages") messages(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
    @Query() query: CareMessageListQueryDto,
  ) {
    return this.chat.messagesProvider(req.user, params.reference, query);
  }
  @Post("messages") send(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
    @Body() dto: SendCareMessageDto,
  ) {
    return this.chat.sendProvider(req.user, params.reference, dto.body, dto.attachmentReferences);
  }
  @Post('attachments') @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } }) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  upload(@Req() req: { user: User }, @Param() params: CareRequestReferenceParamsDto, @UploadedFile() file?: UploadedPrivateFile) { return this.chat.uploadProvider(req.user, params.reference, file); }
  @Get('messages/:messageReference/attachments/:attachmentReference/access') access(@Req() req: { user: User }, @Param() params: CareMessageAttachmentAccessParamsDto) { return this.chat.accessProvider(req.user, params.reference, params.messageReference, params.attachmentReference); }
  @Post("read")
  @ApiOperation({ summary: "Mark Patient messages in this Care Chat as read" })
  read(
    @Req() req: { user: User },
    @Param() params: CareRequestReferenceParamsDto,
  ) {
    return this.chat.readProvider(req.user, params.reference);
  }
}
