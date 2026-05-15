import { PrismaClient } from '@generated/prisma';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import '../env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaMariaDb({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'florieren',
      connectionLimit: 10,
      connectTimeout: 8000,
      acquireTimeout: 12000,
    });

    super({ adapter });

    (BigInt.prototype as any).toJSON = function () {
      return this.toString();
    };
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

normalizeValue(value: any): any {
  if (typeof value === 'bigint') {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const min = BigInt(Number.MIN_SAFE_INTEGER);

    return value <= max && value >= min
      ? Number(value)
      : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(item => this.normalizeValue(item));
  }

  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        this.normalizeValue(nested),
      ]),
    );
  }

  return value;
}
}
