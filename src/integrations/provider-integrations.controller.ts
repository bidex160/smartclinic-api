import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { canManage, CurrentProviderService } from '../providers/current-provider.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ApiKeyIdParamsDto, CreateApiKeyDto, SetWebhookDto } from './integrations.dto';
import { ProviderApiKeysService } from './provider-api-keys.service';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { ForbiddenException } from '@nestjs/common';

/** API keys and webhooks for a facility's own systems. Owner and team admins only. */
@ApiTags('Provider integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/integrations')
export class ProviderIntegrationsController {
  constructor(
    private readonly current: CurrentProviderService,
    private readonly keys: ProviderApiKeysService,
    private readonly webhooks: ProviderWebhooksService,
  ) {}

  @Get() @ApiOperation({ summary: 'API keys, webhook and recent deliveries' })
  async overview(@Req() r: { user: User }) {
    const providerId = await this.manager(r.user);
    return {
      apiKeys: (await this.keys.list(providerId)).items,
      webhook: await this.webhooks.get(providerId),
      webhooksAvailable: this.webhooks.available,
      deliveries: (await this.webhooks.recent(providerId)).items,
    };
  }

  @Post('api-keys') @ApiOperation({ summary: 'Create an API key (shown once)' })
  async createKey(@Req() r: { user: User }, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(await this.manager(r.user), r.user.id, dto.name);
  }

  @Delete('api-keys/:id')
  async revokeKey(@Req() r: { user: User }, @Param() p: ApiKeyIdParamsDto) {
    return this.keys.revoke(await this.manager(r.user), p.id);
  }

  @Put('webhook') @ApiOperation({ summary: 'Set the webhook URL; the signing secret is returned when created or rotated' })
  async setWebhook(@Req() r: { user: User }, @Body() dto: SetWebhookDto) {
    return this.webhooks.set(await this.manager(r.user), r.user.id, dto.url, dto.rotateSecret ?? false);
  }

  @Delete('webhook')
  async removeWebhook(@Req() r: { user: User }) {
    return this.webhooks.remove(await this.manager(r.user));
  }

  @Post('webhook/test') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Send a ping event now' })
  async testWebhook(@Req() r: { user: User }) {
    return this.webhooks.test(await this.manager(r.user));
  }

  private async manager(user: User): Promise<string> {
    const actor = await this.current.resolveOperationalActor(user);
    if (!canManage(actor)) throw new ForbiddenException('Only the facility owner or a team admin can manage integrations');
    return actor.provider.id;
  }
}
