import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as https from 'https';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SchoolFeesService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data: this.prisma.normalizeValue(data), message };
  }

  private get paystackSecret(): string {
    return process.env.PAYSTACK_SECRET_KEY || '';
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.set_session_tbl.findFirst();
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.set_term_tbl.findFirst();
    return r?.set_term || '';
  }

  async getStudentFees(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();

    if (!session || !term) throw new BadRequestException('No active session or term found.');

    const [config, payment, history] = await Promise.all([
      this.prisma.school_fees_config.findFirst({
        where: { class: user.class, session, term },
      }),
      this.prisma.school_fees_payment.findFirst({
        where: { student_id: user.student_id, session, term },
      }),
      this.getPaymentHistory(user.student_id),
    ]);

    return this.ok({
      session,
      term,
      class: user.class,
      amount: config ? Number(config.amount) : null,
      description: config?.description || '',
      fee_configured: !!config,
      payment_status: payment?.status || 'not_paid',
      paid_at: payment?.paid_at || null,
      reference: payment?.paystack_reference || null,
      history: history.data,
    });
  }

  async initializePaystackPayment(user: any, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();

    if (!session || !term) throw new BadRequestException('Session and term are required.');
    if (!user.email) throw new BadRequestException('Student email is required for payment. Please update your profile.');

    const config = await this.prisma.school_fees_config.findFirst({
      where: { class: user.class, session, term },
    });
    if (!config) throw new NotFoundException(`No school fees configured for ${user.class} - ${term} term, ${session} session.`);

    const existing = await this.prisma.school_fees_payment.findFirst({
      where: { student_id: user.student_id, session, term, status: 'success' },
    });
    if (existing) throw new BadRequestException(`School fees for ${term} term, ${session} session have already been paid.`);

    const amount = Number(config.amount);
    const reference = `FEES-${user.student_id}-${session.replace('/', '')}-${term}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '');

    const paystackData = await this.paystackRequest('POST', '/transaction/initialize', {
      email: user.email,
      amount: Math.round(amount * 100),
      reference,
      metadata: {
        student_id: user.student_id,
        student_name: `${user.firstname} ${user.lastname}`,
        class: user.class,
        session,
        term,
        payment_type: 'school_fees',
      },
      callback_url: process.env.PAYSTACK_CALLBACK_URL || `${process.env.APP_URL || 'http://localhost:3000'}/student/school-fees/verify`,
    });

    await this.prisma.school_fees_payment.upsert({
      where: { paystack_reference: reference },
      create: {
        student_id: user.student_id,
        class: user.class,
        session,
        term,
        amount,
        paystack_reference: reference,
        paystack_access_code: paystackData.access_code,
        status: 'pending',
      },
      update: {
        paystack_access_code: paystackData.access_code,
        status: 'pending',
      },
    });

    return this.ok({
      authorization_url: paystackData.authorization_url,
      access_code: paystackData.access_code,
      reference,
      amount,
      session,
      term,
    }, 'Payment initialized. Redirect student to authorization_url.');
  }

  async verifyPaystackPayment(reference: string) {
    if (!reference) throw new BadRequestException('Payment reference is required.');

    const payment = await this.prisma.school_fees_payment.findFirst({
      where: { paystack_reference: reference },
    });
    if (!payment) throw new NotFoundException('Payment record not found.');

    if (payment.status === 'success') {
      return this.ok({ status: 'success', reference, paid_at: payment.paid_at }, 'Payment already verified.');
    }

    const paystackData = await this.paystackRequest('GET', `/transaction/verify/${reference}`);

    if (paystackData.status === 'success') {
      await this.prisma.school_fees_payment.updateMany({
        where: { paystack_reference: reference },
        data: { status: 'success', paid_at: new Date() },
      });

      await this.prisma.create('notifications', {
        user_id: payment.student_id,
        user_type: 'student',
        title: 'School Fees Payment Successful',
        message: `Your school fees payment of ₦${payment.amount} for ${payment.term} term, ${payment.session} session has been confirmed.`,
        is_read: false,
        created_at: new Date(),
      });

      return this.ok({
        status: 'success',
        reference,
        amount: Number(payment.amount),
        session: payment.session,
        term: payment.term,
        paid_at: new Date(),
      }, 'Payment verified successfully.');
    }

    await this.prisma.school_fees_payment.updateMany({
      where: { paystack_reference: reference },
      data: { status: 'failed' },
    });
    throw new BadRequestException(`Payment verification failed. Paystack status: ${paystackData.status}`);
  }

  async getPaymentHistory(studentId: string) {
    const payments = await this.prisma.school_fees_payment.findMany({
      where: { student_id: studentId },
      orderBy: { created_at: 'desc' },
    });
    const student = await this.prisma.users.findFirst({
      where: { student_id: studentId },
      select: { firstname: true, lastname: true, class: true },
    });
    return this.ok(payments.map(payment => ({ ...payment, ...student })));
  }

  async getFeesConfig(q: any) {
    const where: any = {};
    if (q.class) where.class = q.class;
    if (q.session) where.session = q.session;
    if (q.term) where.term = q.term;

    return this.ok(await this.prisma.school_fees_config.findMany({
      where,
      orderBy: [{ session: 'desc' }, { term: 'asc' }, { class: 'asc' }],
    }));
  }

  async setFeesConfig(body: any) {
    const { class: cls, session, term, amount, description } = body;
    if (!cls || !session || !term || amount === undefined) {
      throw new BadRequestException('Class, session, term and amount are required.');
    }

    const config = await this.prisma.school_fees_config.upsert({
      where: {
        class_session_term: { class: cls, session, term },
      },
      create: {
        class: cls,
        session,
        term,
        amount: Number(amount),
        description: description || '',
      },
      update: {
        amount: Number(amount),
        description: description || '',
        updated_at: new Date(),
      },
    });
    return this.ok(config, 'School fees config saved successfully.');
  }

  async updateFeesConfig(id: number, body: any) {
    const config = await this.prisma.school_fees_config.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('School fees config not found.');

    const update: any = {};
    ['class', 'session', 'term', 'description'].forEach(key => {
      if (body[key] !== undefined) update[key] = body[key];
    });
    if (body.amount !== undefined) update.amount = Number(body.amount);
    update.updated_at = new Date();

    return this.ok(await this.prisma.school_fees_config.update({ where: { id }, data: update }), 'School fees config updated successfully.');
  }

  async deleteFeesConfig(id: number) {
    const config = await this.prisma.school_fees_config.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('School fees config not found.');
    await this.prisma.school_fees_config.delete({ where: { id } });
    return this.ok(null, 'School fees config deleted successfully.');
  }

  async getAllPayments(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 100);
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.session) where.session = q.session;
    if (q.term) where.term = q.term;
    if (q.class) where.class = q.class;

    const [total, payments] = await Promise.all([
      this.prisma.school_fees_payment.count({ where }),
      this.prisma.school_fees_payment.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: perPage,
        skip: (page - 1) * perPage,
      }),
    ]);

    const studentIds = [...new Set(payments.map(payment => payment.student_id))];
    const students = await this.prisma.users.findMany({
      where: { student_id: { in: studentIds } },
      select: { student_id: true, firstname: true, lastname: true, class: true },
    });
    const byId = new Map(students.map(student => [student.student_id, student]));

    let rows = payments.map(payment => ({
      ...payment,
      firstname: byId.get(payment.student_id)?.firstname,
      lastname: byId.get(payment.student_id)?.lastname,
      student_class: byId.get(payment.student_id)?.class,
    }));

    if (q.search) {
      const term = String(q.search).toLowerCase();
      rows = rows.filter(row =>
        row.student_id.toLowerCase().includes(term)
        || String(row.firstname || '').toLowerCase().includes(term)
        || String(row.lastname || '').toLowerCase().includes(term),
      );
    }

    return {
      success: true,
      data: this.prisma.normalizeValue(rows),
      meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage) },
    };
  }

  async getPaymentsSummary(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    const where: any = {};
    if (session) where.session = session;
    if (term) where.term = term;

    const [students, payments] = await Promise.all([
      this.prisma.users.findMany({ where: { admin_verify: '1' }, select: { student_id: true, class: true } }),
      this.prisma.school_fees_payment.findMany({ where }),
    ]);

    const successful = payments.filter(payment => payment.status === 'success');
    const paidIds = new Set(successful.map(payment => payment.student_id));
    const totalAmount = successful.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const classSummary = new Map<string, any>();

    for (const student of students) {
      const entry = classSummary.get(student.class) || { class: student.class, total_students: 0, paid_count: 0, unpaid_count: 0, total_amount: 0 };
      entry.total_students += 1;
      classSummary.set(student.class, entry);
    }

    for (const payment of successful) {
      const cls = students.find(student => student.student_id === payment.student_id)?.class || payment.class;
      const entry = classSummary.get(cls) || { class: cls, total_students: 0, paid_count: 0, unpaid_count: 0, total_amount: 0 };
      entry.paid_count += 1;
      entry.total_amount += Number(payment.amount);
      classSummary.set(cls, entry);
    }

    for (const entry of classSummary.values()) {
      entry.unpaid_count = Math.max(0, entry.total_students - entry.paid_count);
    }

    return this.ok({
      session,
      term,
      total_students: students.length,
      paid_count: paidIds.size,
      unpaid_count: Math.max(0, students.length - paidIds.size),
      total_amount: totalAmount,
      classes: [...classSummary.values()],
    });
  }

  private async paystackRequest(method: 'GET' | 'POST', path: string, payload?: any): Promise<any> {
    if (!this.paystackSecret) throw new InternalServerErrorException('Paystack secret key is not configured.');

    const body = payload ? JSON.stringify(payload) : undefined;
    const options: https.RequestOptions = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${this.paystackSecret}`,
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (!parsed.status) {
              reject(new BadRequestException(parsed.message || 'Paystack request failed.'));
              return;
            }
            resolve(parsed.data);
          } catch {
            reject(new InternalServerErrorException('Invalid response from Paystack.'));
          }
        });
      });

      req.on('error', () => reject(new InternalServerErrorException('Unable to reach Paystack.')));
      if (body) req.write(body);
      req.end();
    });
  }
}
