import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config';
import { EMAIL_PROVIDER } from './email-provider';
import { TestEmailProvider } from './test-email.provider';
import { UnavailableEmailProvider } from './unavailable-email.provider';
import { Resend } from 'resend';
import { RESEND_CLIENT, ResendEmailProvider } from './resend-email.provider';

@Module({
  imports: [ConfigModule.forFeature(appConfig)],
  providers: [TestEmailProvider, UnavailableEmailProvider, ResendEmailProvider, {
    provide: RESEND_CLIENT,
    inject: [appConfig.KEY],
    useFactory: (config: ConfigType<typeof appConfig>) => config.email.provider === 'resend' && config.email.resendApiKey ? new Resend(config.email.resendApiKey) : null,
  }, {
    provide: EMAIL_PROVIDER,
    inject: [appConfig.KEY, TestEmailProvider, UnavailableEmailProvider, ResendEmailProvider],
    useFactory: (config: ConfigType<typeof appConfig>, test: TestEmailProvider, unavailable: UnavailableEmailProvider, resend: ResendEmailProvider) => config.email.provider === 'test' ? test : config.email.provider === 'resend' ? resend : unavailable,
  }],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
