import 'reflect-metadata';
import './env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs';

// Allow BigInt values to be JSON-serialized (Prisma returns BigInt for id fields)
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function bootstrap() {
  // Ensure upload dirs exist
  ['uploads', 'uploads/messages', 'uploads/bookgame', 'uploads/assignments', 'uploads/leave', 'uploads/quiz-game'].forEach(dir => {
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
