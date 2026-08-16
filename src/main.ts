import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PORT } from './config.js';
import { AppModule } from './http/app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT, '0.0.0.0');
  console.log(`lomi. stellar testnet lab listening on http://0.0.0.0:${PORT}`);
}

bootstrap();
