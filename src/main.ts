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
  ['uploads', 'uploads/messages', 'uploads/bookgame', 'uploads/assignments', 'uploads/leave', 'uploads/quiz-game'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const app = await NestFactory.create(AppModule);

  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

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
