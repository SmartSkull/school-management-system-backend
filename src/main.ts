import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs';

async function bootstrap() {
  // Load .env manually (no @nestjs/config needed)
  const envPath = '.env';
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && !key.startsWith('#')) {
          process.env[key.trim()] = val.join('=').trim();
        }
      });
  }

  // Ensure upload dirs exist
  ['uploads', 'uploads/messages', 'uploads/bookgame', 'uploads/assignments'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Auth-Token',
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Serve uploaded files statically
  const express = app.getHttpAdapter().getInstance();
  express.use('/uploads', require('express').static('uploads'));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Florieren API running on http://localhost:${port}`);
}

bootstrap();
