import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { join } from 'path';
import * as fs from 'fs';

// Safely serialize BigInt values to JSON strings across the application
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // Ensure private storage directories exist (completely isolated from public static server)
  const privateBase = join(process.cwd(), 'storage', 'private');
  const privateBuckets = ['raw-media', 'hls-media', 'keys'];
  for (const b of privateBuckets) {
    const fullPath = join(privateBase, b);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Ensure public uploads directory exists for non-sensitive public assets only (e.g. posters/icons)
  const publicUploadBase = join(process.cwd(), 'uploads', 'public');
  if (!fs.existsSync(publicUploadBase)) {
    fs.mkdirSync(publicUploadBase, { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    { logger: ['error', 'warn', 'log'] }
  );

  // Serve ONLY public non-sensitive assets (Mini App player / icons); private media/videos are strictly excluded
  const publicDir = join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  app.useStaticAssets(publicDir, {
    prefix: '/public/',
  });

  // Enable CORS for local development across different ports (Vite on 5173, Nest on 3000)
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Set global prefix for APIs
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
