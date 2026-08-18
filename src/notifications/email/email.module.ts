import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config';
import { EMAIL_PROVIDER } from './email-provider';
import { TestEmailProvider } from './test-email.provider';
import { UnavailableEmailProvider } from './unavailable-email.provider';

@Module({
  providers: [TestEmailProvider, UnavailableEmailProvider, {
    provide: EMAIL_PROVIDER,
    inject: [appConfig.KEY, TestEmailProvider, UnavailableEmailProvider],
    useFactory: (config: ConfigType<typeof appConfig>, test: TestEmailProvider, unavailable: UnavailableEmailProvider) => config.email.provider === 'test' ? test : unavailable,
  }],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
