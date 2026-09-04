import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { createAppConfiguration } from './config/environment';

async function bootstrap(): Promise<void> {
  const configuration = createAppConfiguration();
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger:
      configuration.environment === 'production'
        ? ['log', 'warn', 'error']
        : ['log', 'warn', 'error', 'debug', 'verbose'],
  });

  const allowedOrigins = [
  'https://cohort.smartclinic.com', 
  'http://localhost:4200',
  'http://localhost:5173',
  configuration.frontendUrl // keep your env one
]

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SmartClinic Health Platform API')
    .setDescription('REST API for the SmartClinic health platform.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(configuration.port);
  Logger.log(
    `SmartClinic API listening on port ${configuration.port}`,
    'Bootstrap',
  );
}

void bootstrap();
