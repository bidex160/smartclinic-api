import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { ClinicalOrdersModule } from "../clinical-orders/clinical-orders.module";
import { ProvidersModule } from "../providers/providers.module";
import { ApiKeyGuard } from "./api-key.guard";
import { IntegrationApiController } from "./integration-api.controller";
import { ProviderApiKey } from "./provider-api-key.entity";
import { ProviderApiKeysService } from "./provider-api-keys.service";
import { ProviderIntegrationsController } from "./provider-integrations.controller";
import { ProviderWebhooksModule } from "./provider-webhooks.module";
import { User } from "../users/entities/user.entity";

@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    ClinicalOrdersModule,
    ProviderWebhooksModule,
    TypeOrmModule.forFeature([ProviderApiKey, User]),
  ],
  controllers: [ProviderIntegrationsController, IntegrationApiController],
  providers: [ProviderApiKeysService, ApiKeyGuard],
})
export class IntegrationsModule {}
