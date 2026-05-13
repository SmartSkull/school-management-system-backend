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
    const r = await this.prisma.academicSession.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const session = await this.prisma.academicSession.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!session) return '';
    const r = await this.prisma.academicTerm.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  async getStudentFees(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();

    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    
    const student = await this.prisma.student.findUnique({ 
      where: { userId: BigInt(user.id) },
      include: { classRoom: true, user: true }
    });

    if (!sessionEntity || !termEntity || !student) throw new BadRequestException('Session, Term, or Student not found.');
    if (!student.classRoomId) {
      // No classroom assigned — try to find any fee config for this period so student can still pay
      const fallbackConfig = await this.prisma.schoolFeeConfig.findFirst({
        where: { sessionId: sessionEntity.id, termId: termEntity.id },
      });
      const payment = await this.prisma.schoolFeePayment.findFirst({
        where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id },
      });
      return this.ok({
        session, term, class: null,
        amount: payment ? Number(payment.amount) : (fallbackConfig ? Number(fallbackConfig.amount) : null),
        description: fallbackConfig?.description || '',
        fee_configured: !!fallbackConfig,
        payment_status: payment?.status || 'not_paid',
        paid_at: payment?.paidAt || null,
        reference: payment?.reference || null,
        history: [],
      });
    }

    const [config, payment, history] = await Promise.all([
      this.prisma.schoolFeeConfig.findFirst({
        where: { classRoomId: student.classRoomId, sessionId: sessionEntity.id, termId: termEntity.id },
      }),
      this.prisma.schoolFeePayment.findFirst({
        where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id },
      }),
      this.getPaymentHistory(student.user.uniqueId),
    ]);

    return this.ok({
      session,
      term,
      class: student.classRoom?.name,
      amount: payment ? Number(payment.amount) : (config ? Number(config.amount) : null),
      description: config?.description || '',
      fee_configured: !!config,
      payment_status: payment?.status || 'not_paid',
      paid_at: payment?.paidAt || null,
      reference: payment?.reference || null,
      history: history.data,
    });
  }

  async initializePaystackPayment(user: any, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();

    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    
    const student = await this.prisma.student.findUnique({ 
      where: { userId: BigInt(user.id) },
      include: { classRoom: true, user: true }
    });

    if (!sessionEntity || !termEntity || !student) throw new BadRequestException('Session, Term, or Student not found.');
    if (!student.user.email) throw new BadRequestException('Student email is required for payment.');

    const config = await this.prisma.schoolFeeConfig.findFirst({
      where: student.classRoomId
        ? { classRoomId: student.classRoomId, sessionId: sessionEntity.id, termId: termEntity.id }
        : { sessionId: sessionEntity.id, termId: termEntity.id },
    });
    if (!config) throw new NotFoundException(`No school fees configured for ${term} term, ${session} session.`);

    const existing = await this.prisma.schoolFeePayment.findFirst({
      where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id, status: 'SUCCESS' },
    });
    if (existing) throw new BadRequestException(`School fees for ${term} term, ${session} session have already been paid.`);

    const amount = Number(config.amount);
    const reference = `FEES-${student.user.uniqueId}-${session.replace('/', '')}-${term}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '');

    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const paystackData = await this.paystackRequest('POST', '/transaction/initialize', {
      email: student.user.email,
      amount: Math.round(amount * 100),
      reference,
      callback_url: `${appUrl}/student/payments/callback`,
      metadata: {
        student_id: student.user.uniqueId,
        student_name: `${student.user.firstName} ${student.user.lastName}`,
        class: student.classRoom?.name,
        session,
        term,
      },
    });

    await this.prisma.schoolFeePayment.upsert({
      where: { reference: reference },
      create: {
        studentId: student.id,
        sessionId: sessionEntity.id,
        termId: termEntity.id,
        amount,
        reference: reference,
        paystackAccessCode: paystackData.access_code,
        status: 'PENDING',
      },
      update: {
        paystackAccessCode: paystackData.access_code,
        status: 'PENDING',
      },
    });

    return this.ok({
      authorization_url: paystackData.authorization_url,
      access_code: paystackData.access_code,
      reference,
      amount,
      session,
      term,
    });
  }

  async verifyPaystackPayment(reference: string) {
    if (!reference) throw new BadRequestException('Payment reference is required.');

    const payment = await this.prisma.schoolFeePayment.findUnique({
      where: { reference },
      include: { student: { include: { user: true } } }
    });
    if (!payment) throw new NotFoundException('Payment record not found.');

    if (payment.status === 'SUCCESS') {
      return this.ok({ status: 'SUCCESS', reference, paid_at: payment.paidAt }, 'Payment already verified.');
    }

    const paystackData = await this.paystackRequest('GET', `/transaction/verify/${reference}`);

    if (paystackData.status === 'success') {
      await this.prisma.schoolFeePayment.update({
        where: { id: payment.id },
        data: { status: 'SUCCESS', paidAt: new Date() },
      });

      await this.prisma.notification.create({
        data: {
          userId: payment.student.userId,
          title: 'School Fees Payment Successful',
          message: `Your school fees payment of ₦${payment.amount} has been confirmed.`,
        },
      });

      return this.ok({
        status: 'SUCCESS',
        reference,
        amount: Number(payment.amount),
        paid_at: new Date(),
      }, 'Payment verified successfully.');
    }

    await this.prisma.schoolFeePayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
    throw new BadRequestException(`Payment verification failed. Paystack status: ${paystackData.status}`);
  }

  async getPaymentHistory(uniqueId: string) {
    const student = await this.prisma.student.findFirst({ 
      where: { user: { uniqueId } },
      include: { user: true, classRoom: true }
    });
    if (!student) throw new NotFoundException('Student not found');

    const payments = await this.prisma.schoolFeePayment.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });
    return this.ok(payments.map(p => ({ 
      ...p,
      amount: Number(p.amount),
      firstname: student.user.firstName, 
      lastname: student.user.lastName, 
      class: student.classRoom?.name 
    })));
  }

  async getFeesConfig(q: any) {
    const where: any = {};
    if (q.class) {
      const classRoom = await this.prisma.classRoom.findFirst({ where: { name: q.class } });
      if (classRoom) where.classRoomId = classRoom.id;
    }
    if (q.session) {
      const session = await this.prisma.academicSession.findFirst({ where: { name: q.session } });
      if (session) where.sessionId = session.id;
    }
    if (q.term) {
      const term = await this.prisma.academicTerm.findFirst({ where: { name: q.term as any } });
      if (term) where.termId = term.id;
    }

    const configs = await this.prisma.schoolFeeConfig.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true, session: true, term: true }
    });

    return this.ok(configs.map(c => ({
      ...c,
      class: c.classRoom.name,
      session: c.session.name,
      term: c.term.name,
    })));
  }

  async setFeesConfig(body: any) {
    const { class: cls, session: sess, term: t, amount, description } = body;
    if (!cls || !sess || !t || amount === undefined) {
      throw new BadRequestException('Class, session, term and amount are required.');
    }

    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: cls } });
    const session = await this.prisma.academicSession.findFirst({ where: { name: sess } });
    const term = await this.prisma.academicTerm.findFirst({ where: { name: t as any, sessionId: session?.id } });

    if (!classRoom || !session || !term) throw new BadRequestException('Class, Session, or Term not found.');

    const config = await this.prisma.schoolFeeConfig.upsert({
      where: {
        classRoomId_sessionId_termId: { 
          classRoomId: classRoom.id, 
          sessionId: session.id, 
          termId: term.id 
        },
      },
      create: {
        classRoomId: classRoom.id,
        sessionId: session.id,
        termId: term.id,
        amount: Number(amount),
        description: description || '',
      },
      update: {
        amount: Number(amount),
        description: description || '',
      },
    });
    return this.ok(config, 'School fees config saved successfully.');
  }

  async updateFeesConfig(id: number, body: any) {
    const config = await this.prisma.schoolFeeConfig.findUnique({ where: { id: BigInt(id) } });
    if (!config) throw new NotFoundException('School fees config not found.');

    const update: any = {};
    if (body.amount !== undefined) update.amount = Number(body.amount);
    if (body.description !== undefined) update.description = body.description;

    return this.ok(await this.prisma.schoolFeeConfig.update({ where: { id: BigInt(id) }, data: update }), 'School fees config updated successfully.');
  }

  async deleteFeesConfig(id: number) {
    const config = await this.prisma.schoolFeeConfig.findUnique({ where: { id: BigInt(id) } });
    if (!config) throw new NotFoundException('School fees config not found.');
    await this.prisma.schoolFeeConfig.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'School fees config deleted successfully.');
  }

  async getAllPayments(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 100);
    const where: any = {};
    
    if (q.status) where.status = q.status;
    if (q.session) {
      const session = await this.prisma.academicSession.findFirst({ where: { name: q.session } });
      if (session) where.sessionId = session.id;
    }
    if (q.term) {
      const term = await this.prisma.academicTerm.findFirst({ where: { name: q.term as any } });
      if (term) where.termId = term.id;
    }

    const [total, payments] = await Promise.all([
      this.prisma.schoolFeePayment.count({ where }),
      this.prisma.schoolFeePayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: perPage,
        skip: (page - 1) * perPage,
        include: { student: { include: { user: true, classRoom: true } } }
      }),
    ]);

    const rows = payments.map(p => ({
      ...p,
      id: p.id.toString(),
      amount: Number(p.amount),
      student_id: p.student.user.uniqueId,
      firstname: p.student.user.firstName,
      lastname: p.student.user.lastName,
      student_class: p.student.classRoom?.name,
    }));

    return {
      success: true,
      data: rows,
      meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage) },
    };
  }

  async getPaymentsSummary(q: any) {
    const where: any = { status: 'SUCCESS' };

    if (q.session) {
      const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: q.session } });
      if (sessionEntity) where.sessionId = sessionEntity.id;
    }
    if (q.term) {
      const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: q.term.toUpperCase() as any } });
      if (termEntity) where.termId = termEntity.id;
    }

    const [students, payments] = await Promise.all([
      this.prisma.student.findMany({ include: { classRoom: true } }),
      this.prisma.schoolFeePayment.findMany({ where }),
    ]);

    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const paidIds = new Set(payments.map(p => p.studentId.toString()));

    const classSummary = new Map<string, any>();
    for (const student of students) {
      const className = student.classRoom?.name || 'Unassigned';
      const entry = classSummary.get(className) || { class: className, total_students: 0, paid_count: 0, unpaid_count: 0, total_amount: 0 };
      entry.total_students += 1;
      if (paidIds.has(student.id.toString())) {
        entry.paid_count += 1;
        const payment = payments.find(p => p.studentId.toString() === student.id.toString());
        if (payment) entry.total_amount += Number(payment.amount);
      }
      classSummary.set(className, entry);
    }

    for (const entry of classSummary.values()) {
      entry.unpaid_count = Math.max(0, entry.total_students - entry.paid_count);
    }

    return this.ok({
      session: q.session || 'all',
      term: q.term || 'all',
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
