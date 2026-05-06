import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: mysql.Pool;

  onModuleInit() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'florieren',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, params);
    return rows as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async insert(table: string, data: Record<string, any>): Promise<number> {
    const cols = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const [result] = await this.pool.execute(
      `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
      Object.values(data),
    ) as any;
    return result.insertId;
  }

  async update(table: string, data: Record<string, any>, where: string, whereParams: any[] = []): Promise<number> {
    const set = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const [result] = await this.pool.execute(
      `UPDATE ${table} SET ${set} WHERE ${where}`,
      [...Object.values(data), ...whereParams],
    ) as any;
    return result.affectedRows;
  }

  async delete(table: string, where: string, params: any[] = []): Promise<number> {
    const [result] = await this.pool.execute(
      `DELETE FROM ${table} WHERE ${where}`,
      params,
    ) as any;
    return result.affectedRows;
  }

  async count(table: string, where = '1=1', params: any[] = []): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`,
      params,
    );
    return Number(row?.count ?? 0);
  }
}
