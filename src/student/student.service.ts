import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { uploadToCloudinary } from '../common/cloudinary';

function computeGrade(total: number): string {
  if (total >= 75) return 'A1';
  if (total >= 70) return 'B2';
  if (total >= 65) return 'B3';
  if (total >= 60) return 'C4';
  if (total >= 55) return 'C5';
  if (total >= 50) return 'C6';
  if (total >= 45) return 'D7';
  if (total >= 40) return 'E8';
  return 'F9';
}

function computeRemark(grade: string): string {
  const map: Record<string, string> = {
    A1: 'Excellent', B2: 'Very Good', B3: 'Good',
    C4: 'Credit', C5: 'Credit', C6: 'Credit',
    D7: 'Pass', E8: 'Pass', F9: 'Fail',
  };
  return map[grade] ?? 'Fail';
}

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  private userId(user: any): bigint {
    return BigInt(user.authUserId ?? user.userId ?? user.user?.id ?? user.id);
  }

  private async studentClassRoomWhere(user: any) {
    const schoolId = this.schoolId(user);
    const student = await this.prisma.student.findUnique({
      where: { userId: this.userId(user) },
      select: { classRoomId: true },
    });

    if (student?.classRoomId) {
      return {
        classRoomId: student.classRoomId,
        ...(schoolId ? { classRoom: { schoolId } } : {}),
      };
    }

    return {
      classRoom: {
        name: user.class,
        ...(schoolId ? { schoolId } : {}),
      },
    };
  }

  private async getCurrentSession(user?: any): Promise<string> {
    const schoolId = user?.schoolId ? BigInt(user.schoolId) : undefined;
    const where = schoolId ? { schoolId } : {};
    const r = await this.prisma.academicSession.findFirst({ where: { ...where, isCurrent: true } })
      ?? await this.prisma.academicSession.findFirst({ where, orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async getCurrentTerm(user?: any): Promise<string> {
    const schoolId = user?.schoolId ? BigInt(user.schoolId) : undefined;
    const where: any = schoolId ? { schoolId } : {};
    const r = await this.prisma.academicTerm.findFirst({ where: { ...where, isCurrent: true } })
      ?? await this.prisma.academicTerm.findFirst({ where, orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  async dashboard(user: any) {
    const assignmentWhere = await this.studentClassRoomWhere(user);
    const [session, term, unread, assignments] = await Promise.all([
      this.getCurrentSession(user),
      this.getCurrentTerm(user),
      this.prisma.notification.count({ where: { userId: BigInt(user.id), readAt: null } }),
      this.assignmentsWithStaff(assignmentWhere, 5),
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
    const schoolId = this.schoolId(user);
    const session = q.session || await this.getCurrentSession(user);
    const term = q.term || await this.getCurrentTerm(user);

    if (!session || !term) {
      throw new BadRequestException('No active session or term found. Please contact admin.');
    }

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    if (!sessionEntity || !termEntity) {
      throw new BadRequestException('Session or Term not found.');
    }

    const student = await this.prisma.student.findUnique({
      where: { userId: BigInt(user.id) },
      include: { classRoom: { select: { name: true } } },
    });
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

    const studentClass = user.student?.classRoom?.name ?? user.class ?? null;

    const [rawResults, attendance, teacher, schoolRow, trait] = await Promise.all([
      this.resultsWithTotals({ studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id }),
      this.prisma.attendance.findFirst({ where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id } }),
      studentClass
        ? this.prisma.staff.findFirst({
            where: {
              classRooms: { some: { name: studentClass, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) } },
              ...(this.schoolId(user) ? { user: { schoolId: this.schoolId(user) } } : {}),
            },
            include: { user: { select: { firstName: true, lastName: true, image: true } } },
          })
        : Promise.resolve(null),
      this.schoolId(user)
        ? this.prisma.school.findUnique({ where: { id: this.schoolId(user) }, select: { principal: true, signature: true } as any }).catch(() => null)
        : Promise.resolve(null),
      this.prisma.studentTrait.findFirst({ where: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id } }),
    ]);

    const results = await this.enrichWithCumulativeScores(rawResults, student.id.toString(), session, term, this.schoolId(user));

    const classSize = await this.prisma.student.count({
      where: {
        classRoomId: student.classRoomId ?? undefined,
        user: {
          status: 'ACTIVE',
          ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}),
        },
      },
    });

    return this.ok({
      results,
      attendance,
      trait: trait ? {
        punctuality: trait.punctuality, perseverance: trait.perseverance, responsibility: trait.responsibility,
        diligence: trait.diligence, selfControl: trait.selfControl, honesty: trait.honesty,
        attendance: trait.attendance, attentiveness: trait.attentiveness, creativity: trait.creativity, curiosity: trait.curiosity,
        drawing: trait.drawing, physicalActivity: trait.physicalActivity, accuracy: trait.accuracy,
        handlingOfTools: trait.handlingOfTools, mentalSkills: trait.mentalSkills,
      } : null,
      class_size: classSize,
      approved: true,
      session,
      term,
      teacher: teacher ? { name: `${teacher.user.firstName} ${teacher.user.lastName}`, image: teacher.user.image } : null,
      principal: (schoolRow as any)?.principal ? { name: (schoolRow as any).principal, image: null } : null,
      signature: (schoolRow as any)?.signature ?? null,
      student: {
        student_id: user.uniqueId,
        firstname: user.firstName,
        lastname: user.lastName,
        class: (student as any).classRoom?.name ?? user.class ?? null,
        image: user.image,
      },
    });
  }

  private async enrichWithCumulativeScores(results: any[], studentId: string, session: string, term: string, schoolId?: bigint): Promise<any[]> {
    const termLower = term.toLowerCase();

    // For first term, no previous scores needed
    if (termLower === 'first') {
      return results.map(r => ({
        ...r,
        cumulative: parseFloat(r.total_score) || 0,
        average: parseFloat(r.total_score) || 0,
      }));
    }

    // Fetch first term scores keyed by course
    const firstTermWhere: any = { name: 'FIRST' as any, session: { name: session } };
    if (schoolId) firstTermWhere.schoolId = schoolId;
    const firstTermEntity = await this.prisma.academicTerm.findFirst({ where: firstTermWhere });
    const firstTermRows = firstTermEntity
      ? await this.resultsWithTotals({ studentId: BigInt(studentId), sessionId: firstTermEntity.sessionId, termId: firstTermEntity.id })
      : [];
    const firstTermMap: Record<string, number> = {};
    for (const r of firstTermRows as any[]) {
      firstTermMap[r.course] = parseFloat(r.total_score) || 0;
    }
    const firstTermCourses = new Set(firstTermRows.map((r: any) => r.course));

    // Fetch second term scores keyed by course (only needed for third term)
    const secondTermMap: Record<string, number> = {};
    const secondTermWhere: any = { name: 'SECOND' as any, session: { name: session } };
    if (schoolId) secondTermWhere.schoolId = schoolId;
    const secondTermEntity = await this.prisma.academicTerm.findFirst({ where: secondTermWhere });
    const secondTermRows = termLower === 'third' && secondTermEntity
      ? await this.resultsWithTotals({ studentId: BigInt(studentId), sessionId: secondTermEntity.sessionId, termId: secondTermEntity.id })
      : [];
    for (const r of secondTermRows as any[]) {
      secondTermMap[r.course] = parseFloat(r.total_score) || 0;
    }
    const secondTermCourses = termLower === 'third' ? new Set(secondTermRows.map((r: any) => r.course)) : null;

    return results.map(r => {
      const current = parseFloat(r.total_score) || 0;
      const first = firstTermMap[r.course] ?? 0;
      const second = secondTermMap[r.course] ?? 0;

      let divisor = 1;
      if (firstTermCourses.has(r.course)) divisor++;
      if (secondTermCourses?.has(r.course)) divisor++;

      const cumulative = first + second + current;
      const average = divisor > 0 ? cumulative / divisor : 0;

      return {
        ...r,
        first_term_score: first,
        second_term_score: termLower === 'third' ? second : undefined,
        cumulative: Math.round(cumulative * 100) / 100,
        average: Math.round(average * 100) / 100,
        grade: computeGrade(average),
        remark: computeRemark(computeGrade(average)),
      };
    });
  }

  async getAssignments(user: any) {
    const where = await this.studentClassRoomWhere(user);
    const assignments = await this.assignmentsWithStaff(where);
    // attach submission status for this student
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) }, select: { id: true } });
    if (!student) return this.ok(assignments);
    const ids = assignments.map((a: any) => BigInt(a.id));
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId: { in: ids }, studentId: student.id },
      select: { assignmentId: true, submittedAt: true, note: true, fileUrl: true },
    });
    const subMap = new Map(submissions.map((s: any) => [s.assignmentId.toString(), s]));
    return this.ok(assignments.map((a: any) => ({ ...a, submission: subMap.get(String(a.id)) ?? null })));
  }

  async submitAssignment(user: any, assignmentId: string, body: { note?: string }, file?: Express.Multer.File) {
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) }, select: { id: true } });
    if (!student) throw new BadRequestException('Student not found');

    let fileUrl: string | undefined;
    if (file) fileUrl = await uploadToCloudinary(file, 'florieren/submissions');

    const submission = await this.prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: BigInt(assignmentId), studentId: student.id } },
      create: { assignmentId: BigInt(assignmentId), studentId: student.id, note: body.note, fileUrl },
      update: { note: body.note, ...(fileUrl ? { fileUrl } : {}), submittedAt: new Date() },
    });
    return this.ok({ ...submission, id: submission.id.toString(), assignmentId: submission.assignmentId.toString(), studentId: submission.studentId.toString() }, 'Assignment submitted');
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
    return rows.map(row => {
      const total = Number(row.testScore) + Number(row.examScore);
      const grade = row.grade || computeGrade(total);
      const remark = row.remark || computeRemark(grade);
      return {
        ...row,
        id: row.id.toString(),
        course: row.subject.name,
        test_score: row.testScore.toString(),
        exam_score: row.examScore.toString(),
        total_score: total.toString(),
        testScore: Number(row.testScore),
        examScore: Number(row.examScore),
        totalScore: total,
        grade,
        remark,
      };
    });
  }

  private async assignmentsWithStaff(where: any, take?: number) {
    const assignments = await this.prisma.assignment.findMany({ 
      where: { ...where, status: 'PUBLISHED' }, 
      orderBy: { createdAt: 'desc' }, 
      ...(take ? { take } : {}),
      include: { staff: { include: { user: true } }, subject: true, classRoom: true }
    });
    return assignments.map((a: any) => ({
      ...a,
      id: a.id.toString(),
      title: a.title,
      subject: a.title,
      course: a.subject?.name ?? a.title,
      description: a.content,
      assignment: a.content,
      class: a.classRoom?.name ?? '',
      due_date: a.dueAt,
      deadline: a.dueAt,
      file_url: a.file,
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

