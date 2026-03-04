import { NestFactory } from '@nestjs/core';
import { BookSlipModule } from './src/main/book-slip/book-slip.module.js';
import { BookSlipService } from './src/main/book-slip/book-slip.service.js';
import { ConfigModule } from '@nestjs/config';
import openaiConfig from './src/config/openai.config.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(BookSlipModule);
  const service = app.get(BookSlipService);

  const testBooks = [
    'Ice Planet Barbarians',
    'The Love Hypothesis',
    'The Serpent and the Wings of Night',
  ];

  for (const query of testBooks) {
    console.log(`\n\n🔎 Testing search for: "${query}"`);
    try {
      const result = await service.discoverBook(query);
      console.log('✅ Result:', JSON.stringify(result.series, null, 2));
      if (result.arc) {
        console.log('✅ Arc:', JSON.stringify(result.arc, null, 2));
      }
      console.log('---');
    } catch (e) {
      console.error(`❌ Failed: ${e.message}`);
    }
  }

  await app.close();
}

bootstrap();
