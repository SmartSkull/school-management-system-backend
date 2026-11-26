import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as net from 'net';
import 'reflect-metadata';
import { AppModule } from './app.module';
import './env';

// Allow BigInt values to be JSON-serialized (Prisma returns BigInt for id fields)
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function getAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '0.0.0.0');
    });

    if (isAvailable) {
      return port;
    }
  }

  return startPort;
}

async function bootstrap() {
  // Ensure upload dirs exist
  ['uploads', 'uploads/messages', 'uploads/bookgame', 'uploads/assignments', 'uploads/leave', 'uploads/quiz-game', 'uploads/cbt-images'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  console.log('[bootstrap] bodyParser disabled — Multer handles multipart');

  // Apply JSON and urlencoded body parsers only to non-multipart requests.
  // NestFactory's built-in bodyParser is disabled above — if it ran on
  // multipart/form-data it would drain the stream before Multer could read it,
  // causing FileInterceptor to always see an empty upload.
  app.use((req: any, res: any, next: any) => {
    if (/multipart\/form-data/i.test(req.headers['content-type'] ?? '')) return next();
    require('express').json({ limit: '50mb' })(req, res, next);
  });
  app.use((req: any, res: any, next: any) => {
    if (/multipart\/form-data/i.test(req.headers['content-type'] ?? '')) return next();
    require('express').urlencoded({ limit: '50mb', extended: true })(req, res, next);
  });

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Auth-Token',
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Serve uploaded files statically
  const express = app.getHttpAdapter().getInstance();
  express.use('/uploads', require('express').static('uploads'));

  const requestedPort = Number(process.env.PORT || 3000);
  const port = await getAvailablePort(Number.isFinite(requestedPort) ? requestedPort : 3000);
  await app.listen(port);
  console.log(`🚀 Florieren API running on http://localhost:${port}`);
}

bootstrap();
