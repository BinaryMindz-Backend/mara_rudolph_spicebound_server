import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Stripe webhook signature verification
  });


// Middleware order is CRITICAL: Raw parser MUST come first for webhooks
// Otherwise the JSON parser will consume the body before webhook middleware sees it
// Use application/octet-stream to capture the raw bytes exactly as Stripe sends them
app.use('/stripe/webhook', bodyParser.raw({ type: 'application/octet-stream' }));
app.use('/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
// Then apply JSON parser for all other routes
app.use(bodyParser.json());
  // Configure CORS
  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? ['https://readspicebound.com', 'https://www.readspicebound.com']
      : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5050',
      ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      skipMissingProperties: false,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('Spicebound API')
    .setDescription('Backend API for Spicebound MVP')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
