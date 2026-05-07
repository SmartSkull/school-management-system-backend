import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client';

const MODEL_ALIASES: Record<string, string> = {
  class: 'Renamedclass',
  comments: 'comment',
  notification: 'notifications',
  student_answers: 'student_answer',
};

const PRIMARY_KEYS: Record<string, string> = {
  Renamedclass: 'class_id',
  assignment: 'assignment_id',
  attendance: 'attendance_id',
  cbt: 'cbt_id',
  comment: 'comment_id',
  course: 'course_id',
  library: 'library_id',
  likes: 'likes_id',
  messages: 'msg_id',
  notifications: 'id',
  post: 'post_id',
  result: 'result_id',
  scratch_card: 'scratch_card_id',
  session: 'session_id',
  set_session_tbl: 'set_session_id',
  set_term_tbl: 'set_term_id',
  staff: 'staff_id',
  student_answer: 'id',
  term: 'term_id',
  users: 'user_id',
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaMariaDb({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'florieren',
      connectionLimit: 10,
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  findMany<T = any>(table: string, args: any = {}): Promise<T[]> {
    return this.run<T[]>(table, 'findMany', this.cleanArgs(table, args));
  }

  findFirst<T = any>(table: string, args: any = {}): Promise<T | null> {
    return this.run<T | null>(table, 'findFirst', this.cleanArgs(table, args));
  }

  async create(table: string, data: Record<string, any>): Promise<number> {
    const model = this.modelName(table);
    const row = await this.run<any>(model, 'create', { data: this.cleanData(model, data) });
    const primaryKey = PRIMARY_KEYS[model];
    return Number(row?.[primaryKey] ?? row?.id ?? 0);
  }

  async updateMany(table: string, where: any, data: Record<string, any>): Promise<number> {
    const model = this.modelName(table);
    const result = await this.run<any>(model, 'updateMany', {
      where,
      data: this.cleanData(model, data),
    });
    return Number(result?.count ?? 0);
  }

  async deleteMany(table: string, where: any): Promise<number> {
    const result = await this.run<any>(table, 'deleteMany', { where });
    return Number(result?.count ?? 0);
  }

  count(table: string, where: any = {}): Promise<number> {
    return this.run<number>(table, 'count', { where });
  }

  groupBy<T = any>(table: string, args: any): Promise<T[]> {
    return this.run<T[]>(table, 'groupBy', args);
  }

  normalizeValue(value: any): any {
    if (typeof value === 'bigint') {
      return value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER
        ? Number(value)
        : value.toString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.normalizeValue(item));
    }

    if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, this.normalizeValue(nested)]),
      );
    }

    return value;
  }

  private async run<T>(table: string, method: string, args: any): Promise<T> {
    const model = this.modelName(table);
    const delegate = (this as any)[model];
    if (!delegate?.[method]) {
      throw new Error(`Prisma model method not found: ${model}.${method}`);
    }
    return this.normalizeValue(await delegate[method](args));
  }

  private modelName(table: string): string {
    return MODEL_ALIASES[table] ?? table;
  }

  private cleanArgs(table: string, args: any) {
    if (!args?.select) return args;
    const model = this.modelName(table);
    const fields = this.modelFields(model);
    return {
      ...args,
      select: Object.fromEntries(
        Object.entries(args.select).filter(([key]) => fields.has(key)),
      ),
    };
  }

  private cleanData(table: string, data: Record<string, any>) {
    const model = this.modelName(table);
    const fields = this.modelFields(model);
    return Object.fromEntries(
      Object.entries(data).filter(([key, value]) => value !== undefined && fields.has(key)),
    );
  }

  private modelFields(model: string): Set<string> {
    const runtimeModel = (this as any)._runtimeDataModel?.models?.[model];
    return new Set(runtimeModel?.fields?.map((field: any) => field.name) ?? []);
  }
}
