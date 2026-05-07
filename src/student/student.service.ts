import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.set_session_tbl.findFirst();
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.set_term_tbl.findFirst();
    return r?.set_term || '';
  }

  async dashboard(user: any) {
    const [session, term, unread, assignments] = await Promise.all([
      this.getCurrentSession(),
      this.getCurrentTerm(),
      this.prisma.notifications.count({ where: { user_id: user.student_id as any, is_read: false } }),
      this.assignmentsWithStaff({ class: user.class }, 5),
    ]);
    return this.ok({ user, current_session: session, current_term: term, unread_notifications: unread, recent_assignments: assignments });
  }

  async profile(user: any) {
    const profile = await this.prisma.users.findFirst({ where: { student_id: user.student_id } });
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstname', 'lastname', 'email', 'telephone', 'date_of_birth', 'state_of_origin', 'home_address', 'father_name', 'mother_name', 'gender'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    if (Object.keys(update).length) await this.prisma.users.updateMany({ where: { student_id: user.student_id }, data: update });
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    await this.prisma.users.updateMany({ where: { student_id: user.student_id }, data: { image: file.filename } });
    return this.ok({ image: file.filename }, 'Image updated successfully');
  }

  async getResults(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();

    if (!session || !term) {
      throw new BadRequestException('No active session or term found. Please contact admin.');
    }

    // Check if any result exists for this student, session and term
    const resultExists = await this.prisma.result.findFirst({
      where: { student_id: user.student_id, session, term },
      select: { result_id: true, approved: true },
    });

    if (!resultExists) {
      throw new NotFoundException(`No results found for ${term} term, ${session} session.`);
    }

    if (!resultExists.approved || resultExists.approved == '0') {
      throw new NotFoundException(`Results for ${term} term, ${session} session have not been approved yet. Please check back later.`);
    }

    const [rawResults, attendance, teacher, principal] = await Promise.all([
      this.resultsWithTotals({ student_id: user.student_id, session, term }),
      this.prisma.attendance.findFirst({ where: { student_id: user.student_id, session, term } }),
      this.prisma.staff.findFirst({ where: { class: user.class }, select: { firstname: true, lastname: true, image: true } }),
      this.prisma.staff.findFirst({ where: { user: 'admin' }, select: { firstname: true, lastname: true, image: true } }),
    ]);

    // Enrich results with previous term scores
    const results = await this.enrichWithCumulativeScores(rawResults, user.student_id, session, term);

    const classStudents = await this.prisma.users.findMany({
      where: { class: user.class },
      select: { student_id: true },
    });
    const classSize = new Set((await this.prisma.result.findMany({
      where: {
        student_id: { in: classStudents.map(s => s.student_id) },
        session,
        term,
        approved: '1',
      },
      select: { student_id: true },
    })).map(r => r.student_id)).size;

    return this.ok({
      results,
      attendance,
      class_size: classSize,
      approved: true,
      session,
      term,
      teacher: teacher ? { name: `${teacher.firstname} ${teacher.lastname}`, image: teacher.image } : null,
      principal: principal ? { name: `${principal.firstname} ${principal.lastname}`, image: principal.image } : null,
      student: {
        student_id: user.student_id,
        firstname: user.firstname,
        lastname: user.lastname,
        class: user.class,
        image: user.image,
      },
    });
  }

  private async enrichWithCumulativeScores(results: any[], studentId: string, session: string, term: string): Promise<any[]> {
    const termLower = term.toLowerCase();

    // For first term, no previous scores needed
    if (termLower === 'first') {
      return results.map(r => ({
        ...r,
        first_term_score: parseFloat(r.total_score) || 0,
        second_term_score: 0,
        cumulative: parseFloat(r.total_score) || 0,
        average: parseFloat(r.total_score) || 0,
      }));
    }

    // Fetch first term scores keyed by course
    const firstTermRows = await this.resultsWithTotals({ student_id: studentId, session, term: 'first' });
    const firstTermMap: Record<string, number> = {};
    for (const r of firstTermRows as any[]) {
      firstTermMap[r.course] = parseFloat(r.total_score) || 0;
    }

    // Fetch second term scores keyed by course (only needed for third term)
    const secondTermMap: Record<string, number> = {};
    if (termLower === 'third') {
      const secondTermRows = await this.resultsWithTotals({ student_id: studentId, session, term: 'second' });
      for (const r of secondTermRows as any[]) {
        secondTermMap[r.course] = parseFloat(r.total_score) || 0;
      }
    }

    return results.map(r => {
      const current = parseFloat(r.total_score) || 0;
      const first = firstTermMap[r.course] ?? 0;
      const second = secondTermMap[r.course] ?? 0;

      let cumulative: number;
      let average: number;

      if (termLower === 'second') {
        cumulative = first + current;
        const termsWithScores = (first > 0 ? 1 : 0) + (current > 0 ? 1 : 0);
        average = termsWithScores > 0 ? cumulative / termsWithScores : 0;
      } else {
        // third
        cumulative = first + second + current;
        const termsWithScores = (first > 0 ? 1 : 0) + (second > 0 ? 1 : 0) + (current > 0 ? 1 : 0);
        average = termsWithScores > 0 ? cumulative / termsWithScores : 0;
      }

      return {
        ...r,
        first_term_score: first,
        second_term_score: termLower === 'third' ? second : undefined,
        cumulative: Math.round(cumulative * 100) / 100,
        average: Math.round(average * 100) / 100,
      };
    });
  }

  async getAssignments(user: any) {
    return this.ok(await this.assignmentsWithStaff({ class: user.class }));
  }

  async getLibrary(user: any) {
    const items = await this.prisma.library.findMany({ where: { class: user.class, verify: '1' }, orderBy: { date: 'desc' } });
    return this.ok(await this.withStaffNames(items));
  }

  async getClassTimetable(user: any) {
    return this.ok(await this.prisma.class_timetable.findMany({ where: { class: user.class } }));
  }

  async getExamTimetable(user: any) {
    const juniorClasses = ['JSS1', 'JSS2', 'JSS3'];
    const level = juniorClasses.includes(user.class?.toUpperCase()) ? 'junior' : 'senior';
    return this.ok(await this.prisma.exam_timetable.findMany({ where: { user: level } }));
  }

  async getNotifications(user: any) {
    return this.ok(await this.prisma.notifications.findMany({ where: { user_id: user.student_id as any, user_type: 'student' }, orderBy: { id: 'desc' } }));
  }

  async markNotificationsRead(user: any) {
    await this.prisma.notifications.updateMany({ where: { user_id: user.student_id as any, user_type: 'student', is_read: false }, data: { is_read: true } });
    return this.ok(null, 'Notifications marked as read');
  }

  async getPayments(user: any) {
    const payments = await this.prisma.scratch_card.findMany({ where: { student_id: user.student_id }, orderBy: { scratch_card_id: 'desc' } });
    if (!payments.length) {
      throw new NotFoundException('No payment records found for this student.');
    }
    return this.ok(payments);
  }

  async initializePayment(user: any, body: any) {
    const amount = body.type === 'scratch_card' ? 500 : (parseInt(body.amount) || 0);
    if (!amount) throw new BadRequestException('Invalid payment amount.');
    return this.ok({ message: 'Please submit your payment receipt', amount, type: body.type || 'scratch_card' });
  }

  async getScratchCards(user: any) {
    const cards = await this.prisma.scratch_card.findMany({ where: { student_id: user.student_id }, orderBy: { scratch_card_id: 'desc' } });
    if (!cards.length) {
      throw new NotFoundException('No scratch card records found for this student.');
    }
    return this.ok(cards);
  }

  async submitPayment(user: any, body: any) {
    const { session, term, amount = '500', transfer_date } = body;
    if (!session || !term) throw new BadRequestException('Session and term are required.');
    const existing = await this.prisma.scratch_card.findFirst({ where: { student_id: user.student_id, session, term }, select: { scratch_card_id: true } });
    if (existing) throw new BadRequestException(`You have already submitted a payment for ${term} term, ${session} session.`);
    const payment = await this.prisma.scratch_card.create({
      data: {
        student_id: user.student_id,
        class: user.class || '',
        transfer_amount: String(amount),
        transfer_date: transfer_date || new Date().toISOString().split('T')[0],
        upload: '',
        term,
        session,
        verified: 'no',
        status: 'pending',
        reference: '',
        date: String(new Date()),
        admin_date: '',
      },
    });
    return this.ok({ id: payment.scratch_card_id }, 'Payment submitted successfully. Awaiting admin verification.');
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ where });
    return rows.map(row => ({
      ...row,
      total_score: (parseFloat(row.test_score) || 0) + (parseFloat(row.exam_score) || 0),
    }));
  }

  private async assignmentsWithStaff(where: any, take?: number) {
    const assignments = await this.prisma.assignment.findMany({ where, orderBy: { date: 'desc' }, ...(take ? { take } : {}) });
    return this.withStaffNames(assignments);
  }

  private async withStaffNames<T extends { staff_id?: string }>(items: T[]) {
    const staffIds = [...new Set(items.map(item => item.staff_id).filter(Boolean))];
    const staff = await this.prisma.staff.findMany({
      where: { unique_id: { in: staffIds } },
      select: { unique_id: true, firstname: true, lastname: true },
    });
    const byId = new Map(staff.map(s => [s.unique_id, s]));
    return items.map(item => ({ ...item, firstname: byId.get(item.staff_id)?.firstname, lastname: byId.get(item.staff_id)?.lastname }));
  }
}
