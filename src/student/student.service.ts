import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { uploadToCloudinary } from '../common/cloudinary';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.academicSession.findFirst({ where: { isCurrent: true } })
      ?? await this.prisma.academicSession.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.academicTerm.findFirst({ where: { isCurrent: true } })
      ?? await this.prisma.academicTerm.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  async dashboard(user: any) {
    const [session, term, unread, assignments] = await Promise.all([
      this.getCurrentSession(),
      this.getCurrentTerm(),
      this.prisma.notification.count({ where: { userId: BigInt(user.id), readAt: null } }),
      this.assignmentsWithStaff({ classRoom: { name: user.class, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) } }, 5),
    ]);
    return this.ok({
      user: {
        firstname: user.firstName,
        lastname: user.lastName,
        class: user.class ?? user.student?.classRoom?.name ?? '',
        image: user.image,
        uniqueId: user.uniqueId,
      },
      current_session: session, current_term: term, unread_notifications: unread, recent_assignments: assignments
    });
  }

  async profile(user: any) {
    const profile = await this.prisma.user.findUnique({ 
      where: { id: BigInt(user.id) },
      include: { student: { include: { classRoom: true } } }
    });
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstName', 'lastName', 'email', 'telephone'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    
    const studentAllowed = ['dateOfBirth', 'stateOfOrigin', 'homeAddress', 'fatherName', 'motherName', 'religion', 'bloodGroup'];
    const studentUpdate: any = {};
    studentAllowed.forEach(k => { if (data[k] !== undefined) studentUpdate[k] = data[k]; });
    if (studentUpdate.dateOfBirth) studentUpdate.dateOfBirth = new Date(studentUpdate.dateOfBirth);

    if (Object.keys(update).length || Object.keys(studentUpdate).length) {
      await this.prisma.user.update({ 
        where: { id: BigInt(user.id) }, 
        data: {
          ...update,
          student: { update: studentUpdate }
        }
      });
    }
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    const url = await uploadToCloudinary(file, 'florieren/students');
    await this.prisma.user.update({ where: { id: BigInt(user.id) }, data: { image: url } });
    return this.ok({ image: url }, 'Image updated successfully');
  }

  async getResults(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();

    if (!session || !term) {
      throw new BadRequestException('No active session or term found. Please contact admin.');
    }

    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    if (!sessionEntity || !termEntity) {
      throw new BadRequestException('Session or Term not found.');
    }

    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    if (!student) throw new NotFoundException('Student record not found.');

    const resultExists = await this.prisma.result.findFirst({
      where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id },
      select: { id: true, approvedAt: true },
    });

    if (!resultExists) {
      throw new NotFoundException(`No results found for ${term} term, ${session} session.`);
    }

    if (!resultExists.approvedAt) {
      throw new NotFoundException(`Results for ${term} term, ${session} session have not been approved yet. Please check back later.`);
    }

    const [rawResults, attendance, teacher, principal] = await Promise.all([
      this.resultsWithTotals({ studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id }),
      this.prisma.attendance.findFirst({ where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id } }),
      this.prisma.staff.findFirst({ 
        where: { classRooms: { some: { name: user.class, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) } }, user: { ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) } },
        include: { user: { select: { firstName: true, lastName: true, image: true } } } 
      }),
      this.prisma.user.findFirst({ 
        where: { role: 'ADMIN', ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, 
        select: { firstName: true, lastName: true, image: true } 
      }),
    ]);

    const results = await this.enrichWithCumulativeScores(rawResults, student.id.toString(), session, term);

    const classSize = await this.prisma.student.count({
      where: { classRoom: { name: user.class, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, user: { ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) } }
    });

    return this.ok({
      results,
      attendance,
      class_size: classSize,
      approved: true,
      session,
      term,
      teacher: teacher ? { name: `${teacher.user.firstName} ${teacher.user.lastName}`, image: teacher.user.image } : null,
      principal: principal ? { name: `${principal.firstName} ${principal.lastName}`, image: principal.image } : null,
      student: {
        student_id: user.uniqueId,
        firstname: user.firstName,
        lastname: user.lastName,
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
    const firstTermEntity = await this.prisma.academicTerm.findFirst({
      where: { name: 'FIRST' as any, session: { name: session } },
    });
    const firstTermRows = firstTermEntity
      ? await this.resultsWithTotals({ studentId: BigInt(studentId), sessionId: firstTermEntity.sessionId, termId: firstTermEntity.id })
      : [];
    const firstTermMap: Record<string, number> = {};
    for (const r of firstTermRows as any[]) {
      firstTermMap[r.course] = parseFloat(r.total_score) || 0;
    }

    // Fetch second term scores keyed by course (only needed for third term)
    const secondTermMap: Record<string, number> = {};
    if (termLower === 'third') {
      const secondTermEntity = await this.prisma.academicTerm.findFirst({
        where: { name: 'SECOND' as any, session: { name: session } },
      });
      const secondTermRows = secondTermEntity
        ? await this.resultsWithTotals({ studentId: BigInt(studentId), sessionId: secondTermEntity.sessionId, termId: secondTermEntity.id })
        : [];
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
    return this.ok(await this.assignmentsWithStaff({ classRoom: { name: user.class, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) } }));
  }

  async getLibrary(user: any) {
    const items = await this.prisma.libraryResource.findMany({ 
      where: { classRoom: { name: user.class, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, status: 'APPROVED' }, 
      orderBy: { createdAt: 'desc' },
      include: { staff: { include: { user: true } }, subject: true }
    });
    return this.ok(items.map((i: any) => ({
      ...i,
      id: i.id.toString(),
      firstname: i.staff.user.firstName,
      lastname: i.staff.user.lastName,
      course: i.subject?.name
    })));
  }

  async getClassTimetable(user: any) {
    const student = await this.prisma.student.findUnique({
      where: { userId: BigInt(user.id) },
      select: { classRoomId: true },
    });
    if (!student?.classRoomId) return this.ok(null);
    const timetable = await this.prisma.classTimetable.findFirst({
      where: { classRoomId: student.classRoomId },
      orderBy: { updatedAt: 'desc' },
    });
    return this.ok(timetable ? { ...timetable, id: timetable.id.toString(), timetable: timetable.content } : null);
  }

  async getExamTimetable(user: any) {
    const schoolId = this.schoolId(user);
    const rows = await this.prisma.examTimetable.findMany({
      where: schoolId ? { staff: { user: { schoolId } } } : {},
      orderBy: { updatedAt: 'desc' },
    });
    return this.ok(rows.map(r => ({ ...r, id: r.id.toString(), timetable: r.content })));
  }

  async getNotifications(user: any) {
    return this.ok(await this.prisma.notification.findMany({ 
      where: { userId: BigInt(user.id) }, 
      orderBy: { createdAt: 'desc' } 
    }));
  }

  async markNotificationsRead(user: any) {
    await this.prisma.notification.updateMany({ 
      where: { userId: BigInt(user.id), readAt: null }, 
      data: { readAt: new Date() } 
    });
    return this.ok(null, 'Notifications marked as read');
  }

  async getPayments(user: any) {
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    const payments = await this.prisma.schoolFeePayment.findMany({ 
      where: { studentId: student?.id }, 
      orderBy: { createdAt: 'desc' } 
    });
    return this.ok(payments.map(p => ({ ...p, id: p.id.toString() })));
  }

  async initializePayment(user: any, body: any) {
    const amount = body.amount || 0;
    if (!amount) throw new BadRequestException('Invalid payment amount.');
    return this.ok({ message: 'Initializing payment', amount, type: body.type || 'school_fees' });
  }

  async getScratchCards(user: any) {
    // Scratch cards are not in the new schema. 
    return this.ok([]);
  }

  async submitPayment(user: any, body: any) {
    // Simplified for now using SchoolFeePayment
    const { session, term, amount, reference } = body;
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term as any, sessionId: sessionEntity?.id } });

    if (!student || !sessionEntity || !termEntity) throw new BadRequestException('Invalid session, term or student');

    const payment = await this.prisma.schoolFeePayment.create({
      data: {
        studentId: student.id,
        sessionId: sessionEntity.id,
        termId: termEntity.id,
        amount: Number(amount),
        reference: reference || `REF-${Date.now()}`,
        status: 'PENDING',
      },
    });
    return this.ok({ id: payment.id.toString() }, 'Payment submitted successfully.');
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ 
      where, 
      include: { subject: true } 
    });
    return rows.map(row => ({
      ...row,
      id: row.id.toString(),
      course: row.subject.name,
      test_score: row.testScore.toString(),
      exam_score: row.examScore.toString(),
      total_score: (Number(row.testScore) + Number(row.examScore)).toString(),
    }));
  }

  private async assignmentsWithStaff(where: any, take?: number) {
    const assignments = await this.prisma.assignment.findMany({ 
      where, 
      orderBy: { createdAt: 'desc' }, 
      ...(take ? { take } : {}),
      include: { staff: { include: { user: true } } }
    });
    return assignments.map((a: any) => ({
      ...a,
      id: a.id.toString(),
      firstname: a.staff.user.firstName,
      lastname: a.staff.user.lastName,
    }));
  }

  private async withStaffNames<T extends { staffId?: bigint }>(items: T[]) {
    const staffIds = [...new Set(items.map(item => item.staffId).filter(Boolean))] as bigint[];
    const staff = await this.prisma.staff.findMany({
      where: { id: { in: staffIds } },
      include: { user: true },
    });
    const byId = new Map(staff.map(s => [s.id, s]));
    return items.map(item => {
      const s = item.staffId ? byId.get(item.staffId) : null;
      return { ...item, firstname: s?.user.firstName, lastname: s?.user.lastName };
    });
  }
}

