import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { uploadToCloudinary } from '../common/cloudinary';
import { EmailService } from '../common/email.service';

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

function normalizeAssignmentStatus(status?: string): 'PUBLISHED' | 'HIDDEN' {
  return String(status).toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLISHED';
}

function assignmentFileUrl(file?: string | null): string | null {
  if (!file) return null;
  return file.startsWith('http') ? file : `/uploads/assignments/${file}`;
}

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService, private emailService: EmailService) {}

  private safeBigInt(val: any): bigint | null {
    if (!val) return null;
    const n = Number(val);
    return isNaN(n) ? null : BigInt(Math.trunc(n));
  }

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  private userId(user: any): bigint {
    return BigInt(user.authUserId ?? user.userId ?? user.user?.id ?? user.id);
  }

  /**
   * Resolve a subject by name, always preferring the canonical row
   * (classRoomId = null) so that cross-term subjectId lookups stay consistent.
   * Falls back to any row with that name if no null-classRoom row exists.
   */
  private async resolveSubject(name: string) {
    const all = await this.prisma.subject.findMany({ where: { name } });
    if (all.length === 0) return null;
    return all.find(s => s.classRoomId === null) ?? all[0];
  }

  private async staffForSchool(user: any) {
    const schoolId = this.schoolId(user);
    return this.prisma.staff.findFirst({
      where: {
        userId: this.userId(user),
        ...(schoolId ? { user: { schoolId } } : {}),
      },
    });
  }

  private normalizeWebsiteUrl(website?: string | null): string | undefined {
    const trimmed = website?.trim();
    if (!trimmed) return undefined;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();

    const userInfo = user.user ?? user;
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findUnique({ 
      where: { userId: this.userId(user) },
      include: { classRooms: true }
    });

    // Resolve classRoomId: from assigned classrooms, or from most recent assignment
    let classRoomId: bigint | undefined = staff?.classRooms[0]?.id;
    if (!classRoomId) {
      const latestAssignment = await this.prisma.assignment.findFirst({
        where: { staffId: staff?.id, classRoomId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { classRoomId: true },
      });
      classRoomId = latestAssignment?.classRoomId ?? undefined;
    }

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    const [studentCount, assignments, libraryItems] = await Promise.all([
      this.prisma.user.count({ 
        where: { role: 'STUDENT', status: 'ACTIVE', ...(schoolId ? { schoolId } : {}), student: { classRoomId } } 
      }),
      this.prisma.assignment.findMany({ 
        where: { staffId: staff?.id }, 
        orderBy: { createdAt: 'desc' } 
      }),
      this.prisma.libraryResource.findMany({ 
        where: { staffId: staff?.id }, 
        orderBy: { createdAt: 'desc' } 
      }),
    ]);

    // Find the last session+term that has results uploaded (by this staff or for their class)
    const lastResult = await this.prisma.result.findFirst({
      where: {
        ...(classRoomId ? { student: { classRoomId, ...(schoolId ? { user: { schoolId } } : {}) } } : schoolId ? { student: { user: { schoolId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { sessionId: true, termId: true },
    });

    const activeSessionId = lastResult?.sessionId ?? sessionEntity?.id;
    const activeTermId    = lastResult?.termId    ?? termEntity?.id;

    // --- Chart 1: Student Performance Distribution ---
    // Group by student, average their total scores, then bucket by grade
    const results = activeSessionId && activeTermId
      ? await this.prisma.result.findMany({
          where: {
            sessionId: activeSessionId,
            termId: activeTermId,
            ...(classRoomId ? { student: { classRoomId, ...(schoolId ? { user: { schoolId } } : {}) } } : schoolId ? { student: { user: { schoolId } } } : {}),
          },
          select: { studentId: true, testScore: true, examScore: true },
        })
      : [];

    // Group by student, average their total scores — strictly the teacher's class
    const studentTotals = new Map<string, { sum: number; count: number }>();
    for (const r of results) {
      const key = r.studentId.toString();
      const total = Number(r.testScore) + Number(r.examScore);
      const existing = studentTotals.get(key) ?? { sum: 0, count: 0 };
      studentTotals.set(key, { sum: existing.sum + total, count: existing.count + 1 });
    }

    // --- Top 3 students by average score in the teacher's class ---
    const top3Students = classRoomId
      ? [...studentTotals.entries()]
          .map(([studentId, { sum, count }]) => ({ studentId, avg: count > 0 ? sum / count : 0 }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 3)
      : [];

    const top3 = await Promise.all(top3Students.map(async ({ studentId, avg }) => {
      const student = await this.prisma.student.findUnique({
        where: { id: BigInt(studentId) },
        include: { user: true },
      });
      return {
        name: student ? `${student.user.firstName} ${student.user.lastName}` : 'Unknown',
        image: student?.user.image ?? null,
        average: Math.round(avg * 10) / 10,
      };
    }));

    const gradeBuckets = { A1: 0, B: 0, C: 0, D: 0, E8: 0, F9: 0 };
    for (const [, { sum, count }] of studentTotals) {
      const avg = count > 0 ? sum / count : 0;
      if (avg >= 75) gradeBuckets.A1++;
      else if (avg >= 65) gradeBuckets.B++;
      else if (avg >= 50) gradeBuckets.C++;
      else if (avg >= 45) gradeBuckets.D++;
      else if (avg >= 40) gradeBuckets.E8++;
      else gradeBuckets.F9++;
    }
    const performanceDistribution = [
      { grade: 'A1 (75-100)', count: gradeBuckets.A1 },
      { grade: 'B (65-74)',   count: gradeBuckets.B },
      { grade: 'C (50-64)',   count: gradeBuckets.C },
      { grade: 'D7 (45-49)', count: gradeBuckets.D },
      { grade: 'E8 (40-44)', count: gradeBuckets.E8 },
      { grade: 'F9 (0-39)',  count: gradeBuckets.F9 },
    ];

    // --- Chart 2: Assignments by subject (last 5) ---
    const recentAssignments = assignments.slice(0, 5).reverse();
    const assignmentTrend = recentAssignments.map((a, i) => ({
      week: `Assign ${i + 1}`,
      label: a.title?.slice(0, 14) ?? `Assign ${i + 1}`,
      date: a.createdAt?.toISOString().split('T')[0] ?? '',
    }));

    // --- Chart 3: Student Distribution by Class ---
    const classRooms = schoolId
      ? await this.prisma.classRoom.findMany({ where: { schoolId }, orderBy: { name: 'asc' } })
      : staff?.classRooms ?? [];

    const classDistribution = await Promise.all(
      classRooms.map(async (c) => ({
        name: c.name,
        value: await this.prisma.student.count({ where: { classRoomId: c.id, ...(schoolId ? { user: { schoolId } } : {}) } }),
      }))
    );

    return this.ok({ 
      user: {
        firstname: userInfo.firstName,
        lastname: userInfo.lastName,
        image: userInfo.image,
        uniqueId: userInfo.uniqueId,
        class: staff?.classRooms[0]?.name ?? (classRoomId ? (await this.prisma.classRoom.findUnique({ where: { id: classRoomId }, select: { name: true } }))?.name : null),
      },
      current_session: session, 
      current_term: term, 
      total_students: studentCount,
      total_assignments: assignments.length,
      total_library: libraryItems.length,
      analytics: { 
        assignments: { total: assignments.length, recent: assignments.slice(0, 5) }, 
        library: { 
          total: libraryItems.length, 
          verified: libraryItems.filter((i: any) => i.status === 'APPROVED').length, 
          pending: libraryItems.filter((i: any) => i.status === 'PENDING').length 
        },
        performanceDistribution,
        assignmentTrend,
        classDistribution,
        top3Students: top3,
      } 
    });
  }

  async profile(user: any) {
    const profile = await this.prisma.user.findUnique({ 
      where: { id: this.userId(user), ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) },
      include: { staff: true }
    });
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstName', 'lastName', 'email', 'telephone'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    
    const staffAllowed = ['dateOfBirth', 'stateOfOrigin', 'homeAddress', 'about'];
    const staffUpdate: any = {};
    staffAllowed.forEach(k => { if (data[k] !== undefined) staffUpdate[k] = data[k]; });

    if (Object.keys(update).length || Object.keys(staffUpdate).length) {
      await this.prisma.user.update({ 
        where: { id: this.userId(user), ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, 
        data: {
          ...update,
          staff: { update: staffUpdate }
        }
      });
    }
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    const url = await uploadToCloudinary(file, 'florieren/staff');
    await this.prisma.user.update({ where: { id: this.userId(user), ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, data: { image: url } });
    return this.ok({ image: url }, 'Image updated successfully');
  }

  async changePassword(user: any, body: any) {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current password and new password are required');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: this.userId(user) },
      select: { password: true },
    });
    if (!dbUser) throw new BadRequestException('User not found');

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: this.userId(user) },
      data: { password: hashed },
    });
    return this.ok(null, 'Password changed successfully');
  }

  async getStudents(user: any, cls?: string, search?: string) {
    const schoolId = this.schoolId(user);
    const conditions: any[] = [{ role: 'STUDENT' }, { status: 'ACTIVE' }];
    if (schoolId) conditions.push({ schoolId });

    if (cls) {
      conditions.push({ student: { classRoom: { name: cls } } });
    } else {
      const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) }, include: { classRooms: true } });
      if (staff?.classRooms?.length) conditions.push({ student: { classRoomId: staff.classRooms[0].id } });
    }

    if (search) {
      conditions.push({ OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { uniqueId: { contains: search } },
        { email: { contains: search } },
      ]});
    }

    const students = await this.prisma.user.findMany({
      where: { AND: conditions },
      include: { student: { include: { classRoom: true } } }
    });
    return this.ok(students.map(s => ({
      student_id: s.uniqueId,
      firstname: s.firstName,
      lastname: s.lastName,
      email: s.email,
      class: s.student?.classRoom?.name ?? '',
      image: s.image,
    })));
  }

  async getStudentDetails(user: any, id: string) {
    const student = await this.prisma.user.findUnique({ 
      where: { uniqueId: id, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) },
      include: { student: { include: { classRoom: true } } }
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.ok(student);
  }

  private async schoolPrefix(schoolId?: bigint): Promise<string> {
    if (!schoolId) return 'SCH';
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { slug: true } });
    if (!school?.slug) return 'SCH';
    const words = school.slug.split('-').filter(Boolean);
    return words.map((w: string) => w[0].toUpperCase()).join('').slice(0, 3).padEnd(2, 'S');
  }

  private async generateStudentId(schoolId?: bigint): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = await this.schoolPrefix(schoolId);
    const last = await this.prisma.user.findFirst({
      where: { role: 'STUDENT', ...(schoolId ? { schoolId } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { uniqueId: true },
    });
    const num = last ? parseInt(last.uniqueId.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `${prefix}${year}${String(num).padStart(4, '0')}`;
  }

  async createStudent(user: any, data: any) {
    const schoolId = this.schoolId(user);
    const studentId = await this.generateStudentId(schoolId);
    const classRoom = await this.prisma.classRoom.findFirst({
      where: { name: data.class, ...(schoolId ? { schoolId } : {}) },
    });
    const school = schoolId
      ? await this.prisma.school.findUnique({ where: { id: schoolId }, select: { website: true } })
      : null;
    const firstName = data.firstName || data.firstname || '';
    const lastName = data.lastName || data.lastname || '';

    const bcrypt = await import('bcryptjs');
    await this.prisma.user.create({
      data: {
        uniqueId: studentId,
        schoolId,
        role: 'STUDENT',
        firstName,
        lastName,
        email: data.email || '',
        telephone: data.telephone || '',
        password: await bcrypt.hash(data.password || 'greatkings', 10),
        image: 'image.png',
        status: 'PENDING',   // Staff-registered students start as PENDING until admin verifies
        student: {
          create: {
            studentNo: studentId,
            classRoomId: classRoom?.id,
          } as any,
        },
      },
    });

    this.emailService.sendStudentCreated({
      firstName,
      lastName,
      email: data.email || '',
      uniqueId: studentId,
      password: data.password || 'greatkings',
      website: this.normalizeWebsiteUrl(school?.website),
    });

    return this.ok({ student_id: studentId }, 'Student registered successfully. Awaiting admin verification.');
  }

  async uploadResult(user: any, body: any) {
    const schoolId = this.schoolId(user);
    // Prefer session/term from request body so staff upload goes to the correct term
    const session = body.session || await this.getCurrentSession(user);
    const term = (body.term || await this.getCurrentTerm(user)).toUpperCase();

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    if (!sessionEntity) throw new BadRequestException(`Session "${session}" not found`);

    const termWhere: any = { name: term as any, sessionId: sessionEntity.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    if (!termEntity) throw new BadRequestException(`Term "${term}" not found for session "${session}"`);

    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const subject = await this.resolveSubject(body.course);

    if (!staff || !subject) {
      throw new BadRequestException('Staff profile or Subject not found');
    }

    if (Array.isArray(body.results)) {
      let count = 0;
      for (const r of body.results) {
        if (!r.student_id) continue;
        const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: r.student_id, ...(schoolId ? { schoolId } : {}) } } });
        if (!student) continue;

        const testScore = parseFloat(r.test_score) || 0;
        const examScore = parseFloat(r.exam_score) || 0;
        const totalScore = testScore + examScore;
        const grade = computeGrade(totalScore);
        const remark = computeRemark(grade);

        await this.prisma.result.upsert({
          where: {
            studentId_subjectId_sessionId_termId: {
              studentId: student.id,
              subjectId: subject.id,
              sessionId: sessionEntity.id,
              termId: termEntity.id,
            }
          },
          update: {
            testScore,
            examScore,
            totalScore,
            grade,
            remark,
            teacherId: staff.id,
          },
          create: {
            studentId: student.id,
            subjectId: subject.id,
            sessionId: sessionEntity.id,
            termId: termEntity.id,
            testScore,
            examScore,
            totalScore,
            grade,
            remark,
            teacherId: staff.id,
          }
        });
        count++;
      }
      return this.ok({ count }, `Successfully saved ${count} result(s)`);
    }

    return this.ok(null, 'Result upload format error');
  }

  async uploadResultsCsv(user: any, body: any, file: Express.Multer.File) {
    const schoolId = this.schoolId(user);
    const session = body.session || await this.getCurrentSession(user);
    const term = body.term || await this.getCurrentTerm(user);
    const className = body.class;
    const course = body.course;

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const subject = await this.resolveSubject(course);

    if (!sessionEntity || !termEntity || !staff || !subject) {
      throw new BadRequestException('Session, Term, Staff, Subject, or Class not found');
    }

    if (!file?.buffer) throw new BadRequestException('CSV file is required');

    const csvText = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new BadRequestException('CSV file is empty or has no data rows');

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += char; }
      }
      result.push(current);
      return result;
    };

    const headerCols = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const idIdx = headerCols.findIndex(h => h === 'student_id');
    const caIdx = headerCols.findIndex(h => h.startsWith('test_score'));
    const examIdx = headerCols.findIndex(h => h.startsWith('exam_score'));
    if (idIdx === -1 || caIdx === -1 || examIdx === -1) {
      throw new BadRequestException('Invalid CSV template. Header must include: student_id, test_score, exam_score');
    }

    const classWhere: any = { name: className };
    if (schoolId) classWhere.schoolId = schoolId;
    const classRoom = await this.prisma.classRoom.findFirst({ where: classWhere });
    if (!classRoom) throw new BadRequestException('Class not found');

    const students = await this.prisma.user.findMany({
      where: { role: 'STUDENT', status: 'ACTIVE', schoolId, student: { classRoomId: classRoom.id } },
      include: { student: true },
    });
    const studentMap = new Map(students.map(s => [s.uniqueId.toUpperCase(), s]));

    let matched = 0;
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const clean = (v: string | undefined) => (v ?? '').replace(/^"|"$/g, '').trim().replace(/^\t+/, '').toUpperCase();
      const studentId = clean(cols[idIdx]);
      if (!studentId) continue;
      const student = studentMap.get(studentId);
      if (!student) { skipped++; continue; }

      const testScore = parseFloat(clean(cols[caIdx])) || 0;
      const examScore = parseFloat(clean(cols[examIdx])) || 0;
      const totalScore = testScore + examScore;
      const grade = computeGrade(totalScore);
      const remark = computeRemark(grade);

      await this.prisma.result.upsert({
        where: {
          studentId_subjectId_sessionId_termId: {
            studentId: student.student!.id,
            subjectId: subject.id,
            sessionId: sessionEntity.id,
            termId: termEntity.id,
          }
        },
        update: { testScore, examScore, totalScore, grade, remark, teacherId: staff.id },
        create: {
          studentId: student.student!.id,
          subjectId: subject.id,
          sessionId: sessionEntity.id,
          termId: termEntity.id,
          testScore, examScore, totalScore, grade, remark, teacherId: staff.id,
        }
      });
      matched++;
    }

    return this.ok({ matched, skipped }, `Uploaded ${matched} result(s)${skipped ? `, ${skipped} student(s) skipped` : ''}`);
  }



  async getResults(user: any, q: any) {
    const schoolId = this.schoolId(user);
    const session = q.session || await this.getCurrentSession(user);
    const term = (q.term || await this.getCurrentTerm(user)).toUpperCase();

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });

    // If session not found for this school, return empty
    if (!sessionEntity) return this.ok([], 'No results found');

    const termWhere: any = { name: term as any, sessionId: sessionEntity.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    if (q.student_id) {
      const studentRecord = await this.prisma.student.findFirst({ 
        where: { user: { uniqueId: q.student_id, ...(schoolId ? { schoolId } : {}) } },
        include: { user: true, classRoom: true }
      });

      const needFirst  = term === 'SECOND' || term === 'THIRD';
      const needSecond = term === 'THIRD';

      const [firstTerm, secondTerm] = await Promise.all([
        needFirst
          ? this.prisma.academicTerm.findFirst({ where: { name: 'FIRST' as any, sessionId: sessionEntity.id, ...(schoolId ? { schoolId } : {}) } })
          : Promise.resolve(null),
        needSecond
          ? this.prisma.academicTerm.findFirst({ where: { name: 'SECOND' as any, sessionId: sessionEntity.id, ...(schoolId ? { schoolId } : {}) } })
          : Promise.resolve(null),
      ]);

      const [rawResults, firstResults, secondResults] = await Promise.all([
        this.resultsWithTotals({ studentId: studentRecord?.id, sessionId: sessionEntity.id, termId: termEntity?.id }),
        needFirst && firstTerm
          ? this.resultsWithTotals({ studentId: studentRecord?.id, sessionId: sessionEntity.id, termId: firstTerm.id })
          : Promise.resolve([]),
        needSecond && secondTerm
          ? this.resultsWithTotals({ studentId: studentRecord?.id, sessionId: sessionEntity.id, termId: secondTerm.id })
          : Promise.resolve([]),
      ]);

      const firstBySubject  = new Map((firstResults  as any[]).map(r => [r.course, r.total_score]));
      const secondBySubject = new Map((secondResults as any[]).map(r => [r.course, r.total_score]));
      const firstTermCourses = new Set((firstResults as any[]).map((r: any) => r.course));
      const secondTermCourses = new Set((secondResults as any[]).map((r: any) => r.course));

      const results = (rawResults as any[]).map(r => {
        const currentTotal = Number(r.total_score);
        const firstScore   = Number(firstBySubject.get(r.course)  ?? 0);
        const secondScore  = Number(secondBySubject.get(r.course) ?? 0);

        let divisor = 1;
        if (firstTermCourses.has(r.course)) divisor++;
        if (secondTermCourses.has(r.course)) divisor++;

        const cumulative = currentTotal + firstScore + secondScore;
        const average    = divisor > 0 ? cumulative / divisor : currentTotal;

        let grade = 'F'; let remark = 'Fail';
        if (average >= 75) { grade = 'A1'; remark = 'Excellent'; }
        else if (average >= 70) { grade = 'B2'; remark = 'Very Good'; }
        else if (average >= 65) { grade = 'B3'; remark = 'Good'; }
        else if (average >= 60) { grade = 'C4'; remark = 'Credit'; }
        else if (average >= 55) { grade = 'C5'; remark = 'Credit'; }
        else if (average >= 50) { grade = 'C6'; remark = 'Credit'; }
        else if (average >= 45) { grade = 'D7'; remark = 'Pass'; }
        else if (average >= 40) { grade = 'E8'; remark = 'Pass'; }
        else { grade = 'F9'; remark = 'Fail'; }

        return {
          ...r,
          first_term_score:  needFirst  ? (firstBySubject.get(r.course)  ?? '-') : undefined,
          second_term_score: needSecond ? (secondBySubject.get(r.course) ?? '-') : undefined,
          cumulative: cumulative.toFixed(1),
          average:    average.toFixed(1),
          grade,
          remark,
        };
      });

      // Get teacher for this class via classRoom.classTeacher
      const classWithTeacher = studentRecord?.classRoom ? await this.prisma.classRoom.findUnique({
        where: { id: studentRecord.classRoom.id },
        include: { classTeacher: { include: { user: true } } }
      }) : null;
      const classTeacher = classWithTeacher?.classTeacher ?? null;

      // Get principal from school settings
      const school = schoolId ? await this.prisma.school.findUnique({ where: { id: schoolId }, select: { principal: true, signature: true } as any }).catch(() => null) : null;

      // Resolve principal image from the staff table using the saved name
      const principalName: string | null = (school as any)?.principal ?? null;
      const principalStaff = principalName && schoolId
        ? await this.prisma.staff.findMany({
            where: { user: { schoolId } },
            include: { user: { select: { firstName: true, lastName: true, image: true } } },
          }).then(all => all.find(s => `${s.user.firstName} ${s.user.lastName}` === principalName) ?? null)
        : null;

      // Get attendance
      const [attendance, trait] = await Promise.all([
        this.prisma.attendance.findFirst({
          where: { studentId: studentRecord?.id, sessionId: sessionEntity.id, termId: termEntity?.id }
        }),
        studentRecord ? this.prisma.studentTrait.findFirst({
          where: { studentId: studentRecord.id, sessionId: sessionEntity.id, termId: termEntity?.id }
        }) : Promise.resolve(null),
      ]);

      return this.ok({
        results,
        student: studentRecord ? {
          firstName: studentRecord.user.firstName,
          lastName: studentRecord.user.lastName,
          image: studentRecord.user.image,
          uniqueId: studentRecord.user.uniqueId,
        } : null,
        class: studentRecord?.classRoom?.name,
        teacher: classTeacher ? { name: `${classTeacher.user.firstName} ${classTeacher.user.lastName}`, image: classTeacher.user.image } : null,
        principal: principalName ? { name: principalName, image: principalStaff?.user.image ?? null } : null,
        signature: (school as any)?.signature ?? null,
        attendance,
        trait: trait ? {
          punctuality: trait.punctuality, perseverance: trait.perseverance, responsibility: trait.responsibility,
          diligence: trait.diligence, selfControl: trait.selfControl, honesty: trait.honesty,
          attendance: trait.attendance, attentiveness: trait.attentiveness, creativity: trait.creativity, curiosity: trait.curiosity,
          drawing: trait.drawing, physicalActivity: trait.physicalActivity, accuracy: trait.accuracy,
          handlingOfTools: trait.handlingOfTools, mentalSkills: trait.mentalSkills,
        } : null,
      });
    }

    const cls = q.class || user.class;
    const students = await this.prisma.user.findMany({ 
      where: { role: 'STUDENT', status: 'ACTIVE', ...(schoolId ? { schoolId } : {}), student: { classRoom: { name: cls, ...(schoolId ? { schoolId } : {}) } } },
      include: { student: true }
    });
    
    const studentIds = students.map(s => s.student?.id).filter(Boolean) as bigint[];
    const approvedFilter = q.approved === 'approved' ? { not: null } : q.approved === 'pending' ? null : undefined;
    const results = await this.prisma.result.findMany({
      where: {
        sessionId: sessionEntity?.id,
        termId: termEntity?.id,
        studentId: { in: studentIds },
        ...(q.course ? { subject: { name: q.course } } : {}),
        ...(approvedFilter !== undefined ? { approvedAt: approvedFilter } : {}),
      },
      include: { student: { include: { user: true } }, subject: true }
    });

    const data = results.map(r => ({
      ...r,
      student_id: r.student.user.uniqueId,
      firstname: r.student.user.firstName,
      lastname: r.student.user.lastName,
      course: r.subject.name,
      test_score: r.testScore,
      exam_score: r.examScore,
      total_score: Number(r.testScore || 0) + Number(r.examScore || 0),
    }));

    return this.ok(data);
  }

  async deleteResult(user: any, body: any) {
    const { course, session, term, student_ids } = body;
    const schoolId = this.schoolId(user);
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const subject = await this.resolveSubject(course);

    if (!Array.isArray(student_ids)) throw new BadRequestException('student_ids must be an array');
    
    let count = 0;
    for (const id of student_ids) {
      const schoolId = this.schoolId(user);
      const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: id, ...(schoolId ? { schoolId } : {}) } } });
      if (!student) continue;
      
      const affected = await this.prisma.result.deleteMany({ 
        where: { studentId: student.id, subjectId: subject?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      if (affected.count) count++;
    }
    return this.ok({ count }, `Successfully deleted ${count} result(s)`);
  }

  async bulkDeleteResults(user: any, body: any) {
    const { course, session, term, student_ids } = body;
    const schoolId = this.schoolId(user);
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const subject = await this.resolveSubject(course);

    if (!Array.isArray(student_ids) || !student_ids.length) throw new BadRequestException('student_ids must be a non-empty array');
    
    let count = 0;
    for (const id of student_ids) {
      const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: id, ...(schoolId ? { schoolId } : {}) } } });
      if (!student) continue;
      
      const affected = await this.prisma.result.deleteMany({ 
        where: { studentId: student.id, subjectId: subject?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      if (affected.count) count++;
    }
    return this.ok({ count }, `Successfully deleted ${count} result(s)`);
  }

  async getAttendance(user: any, q: any) {
    const schoolId = this.schoolId(user);
    const session = q.session || await this.getCurrentSession(user);
    const term = q.term || await this.getCurrentTerm(user);
    
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    if (q.student_id) {
      const schoolId = this.schoolId(user);
      const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: q.student_id, ...(schoolId ? { schoolId } : {}) } } });
      const att = await this.prisma.attendance.findFirst({ 
        where: { studentId: student?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      return this.ok(att);
    }
    
    if (q.class) {
      const schoolId = this.schoolId(user);
      const students = await this.prisma.user.findMany({ 
        where: { role: 'STUDENT', status: 'ACTIVE', ...(schoolId ? { schoolId } : {}), student: { classRoom: { name: q.class, ...(schoolId ? { schoolId } : {}) } } },
        include: { student: true }
      });
      const studentIds = students.map(s => s.student?.id).filter(Boolean) as bigint[];
      const records = await this.prisma.attendance.findMany({ 
        where: { studentId: { in: studentIds }, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      // Map uniqueId onto each record for frontend matching
      const studentMap = new Map(students.map(s => [s.student!.id.toString(), s.uniqueId]));
      return this.ok(records.map(r => ({ ...r, uniqueId: studentMap.get(r.studentId.toString()) ?? null })));
    }
    throw new BadRequestException('student_id or class is required');
  }

  async updateAttendance(user: any, body: any) {
    const schoolId = this.schoolId(user);
    const session = body.session || await this.getCurrentSession(user);
    const term = body.term || await this.getCurrentTerm(user);
    
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    if (!sessionEntity || !termEntity) throw new BadRequestException('Session or Term not found');

    if (Array.isArray(body.students)) {
      let count = 0;
      for (const s of body.students) {
        if (!s.student_id) continue;
        await this.upsertAttendance(user, s.student_id, s.present || 0, s.absent || 0, sessionEntity.id, termEntity.id);
        count++;
      }
      return this.ok({ count }, `Saved attendance for ${count} student(s)`);
    }

    await this.upsertAttendance(user, body.student_id, body.present, body.absent, sessionEntity.id, termEntity.id);
    return this.ok(null, 'Attendance updated successfully');
  }

  private async upsertAttendance(user: any, studentUniqueId: string, present: number, absent: number, sessionId: bigint, termId: bigint) {
    const schoolId = this.schoolId(user);
    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: studentUniqueId, ...(schoolId ? { schoolId } : {}) } } });
    if (!student) return;

    await this.prisma.attendance.upsert({
      where: {
        studentId_sessionId_termId: {
          studentId: student.id,
          sessionId,
          termId,
        }
      },
      update: {
        present: Number(present),
        absent: Number(absent),
      },
      create: {
        studentId: student.id,
        sessionId,
        termId,
        present: Number(present),
        absent: Number(absent),
      }
    });
  }

  async addComment(user: any, body: any) {
    const { student_id, comment, session, term } = body;
    if (!student_id || !comment || !session || !term) throw new BadRequestException('All fields required');
    const schoolId = this.schoolId(user);
    
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: student_id, ...(schoolId ? { schoolId } : {}) } } });

    if (!sessionEntity || !termEntity || !student) throw new BadRequestException('Session, Term, or Student not found');

    await this.prisma.attendance.upsert({
      where: {
        studentId_sessionId_termId: {
          studentId: student.id,
          sessionId: sessionEntity.id,
          termId: termEntity.id,
        }
      },
      update: { teacherComment: comment },
      create: {
        studentId: student.id,
        sessionId: sessionEntity.id,
        termId: termEntity.id,
        teacherComment: comment,
      }
    });
    return this.ok(null, 'Comment added successfully');
  }

  async createAssignment(user: any, body: any, file?: Express.Multer.File) {
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findFirst({
      where: {
        userId: this.userId(user),
        ...(schoolId ? { user: { schoolId } } : {}),
      },
      include: { user: { include: { school: { select: { name: true, website: true } } } } },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: body.class, ...(schoolId ? { schoolId } : {}) } });
    const subject = await this.prisma.subject.findFirst({
      where: {
        name: body.subject,
        ...(classRoom ? { classRoomId: classRoom.id } : schoolId ? { classRoom: { schoolId } } : {}),
      },
    });

    const status = normalizeAssignmentStatus(body.status);
    const fileUrl = file ? await uploadToCloudinary(file, 'florieren/assignments') : null;
    const assignment = await this.prisma.assignment.create({ 
      data: { 
        title: body.subject || 'Assignment', 
        content: body.assignment, 
        dueAt: body.deadline ? new Date(body.deadline) : null, 
        staffId: staff!.id, 
        classRoomId: classRoom?.id,
        subjectId: subject?.id,
        file: fileUrl,
        status,
      } 
    });
    if (classRoom && status === 'PUBLISHED') {
      const students = await this.prisma.user.findMany({
        where: {
          role: 'STUDENT',
          ...(schoolId ? { schoolId } : {}),
          student: { classRoomId: classRoom.id },
          email: { not: '' },
        },
        select: { firstName: true, lastName: true, email: true },
      });
      const teacherName = staff?.user ? `${staff.user.firstName} ${staff.user.lastName}`.trim() : 'Class Teacher';
      const schoolName = staff?.user.school?.name ?? 'School';
      const website = this.normalizeWebsiteUrl(staff?.user.school?.website);

      for (const student of students) {
        this.emailService.sendAssignmentCreatedStudent({
          studentEmail: student.email,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          subject: body.subject || 'Assignment',
          className: classRoom.name,
          assignment: body.assignment || '',
          dueAt: assignment.dueAt,
          teacherName,
          schoolName,
          website,
          hasAttachment: Boolean(fileUrl),
        }).catch(() => {});
      }
    }
    return this.ok({ id: assignment.id.toString() }, 'Assignment created successfully');
  }

  async getAssignments(user: any) {
    const schoolId = this.schoolId(user);
    const staff = await this.staffForSchool(user);
    const assignments = await this.prisma.assignment.findMany({ 
      where: {
        staffId: staff?.id,
        ...(schoolId ? { staff: { user: { schoolId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true }
    });
    return this.ok(assignments.map(a => ({
      id: a.id.toString(),
      title: a.title,
      subject: a.title,
      assignment: a.content,
      description: a.content,
      class: a.classRoom?.name ?? '',
      deadline: a.dueAt,
      due_date: a.dueAt,
      file: a.file,
      file_url: assignmentFileUrl(a.file),
      status: a.status,
      createdAt: a.createdAt,
    })));
  }

  async getAssignmentSubmissions(user: any, id: number) {
    const staff = await this.staffForSchool(user);
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: BigInt(id), staffId: staff?.id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId: BigInt(id) },
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { submittedAt: 'desc' },
    });
    return this.ok(submissions.map(s => ({
      id: s.id.toString(),
      studentName: `${s.student.user.firstName} ${s.student.user.lastName}`,
      note: s.note,
      fileUrl: s.fileUrl,
      submittedAt: s.submittedAt,
    })));
  }

  async updateAssignment(user: any, id: number, body: any, file?: Express.Multer.File) {
    const schoolId = this.schoolId(user);
    const staff = await this.staffForSchool(user);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: BigInt(id),
        staffId: staff?.id,
        ...(schoolId ? { staff: { user: { schoolId } } } : {}),
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    
    const data: any = {};
    if (body.assignment) data.content = body.assignment;
    if (body.deadline) data.dueAt = new Date(body.deadline);
    if (body.subject) data.title = body.subject;
    if (body.status !== undefined) data.status = normalizeAssignmentStatus(body.status);
    if (file) data.file = await uploadToCloudinary(file, 'florieren/assignments');
    if (body.class) {
      const classRoom = await this.prisma.classRoom.findFirst({
        where: { name: body.class, ...(schoolId ? { schoolId } : {}) },
      });
      data.classRoomId = classRoom?.id ?? null;
    }
    if (body.subject) {
      const subject = await this.prisma.subject.findFirst({
        where: {
          name: body.subject,
          ...(data.classRoomId ? { classRoomId: data.classRoomId } : schoolId ? { classRoom: { schoolId } } : {}),
        },
      });
      data.subjectId = subject?.id ?? null;
    }
    
    await this.prisma.assignment.update({ where: { id: BigInt(id) }, data });
    return this.ok(null, 'Assignment updated successfully');
  }

  async deleteAssignment(user: any, id: number) {
    const schoolId = this.schoolId(user);
    const staff = await this.staffForSchool(user);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: BigInt(id),
        staffId: staff?.id,
        ...(schoolId ? { staff: { user: { schoolId } } } : {}),
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.prisma.assignment.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Assignment deleted successfully');
  }

  async getLibrary(user: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const items = await this.prisma.libraryResource.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true, subject: true }
    });
    return this.ok(items.map(i => ({ 
      ...i, 
      id: i.id.toString(),
      class: i.classRoom?.name,
      course: i.subject?.name,
      file_url: i.file ? `/uploads/${i.file}` : null,
    })));
  }

  async uploadLibrary(user: any, body: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: body.class, ...(schoolId ? { schoolId } : {}) } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.course, ...(schoolId ? { classRoom: { schoolId } } : {}) } });

    const fileUrl = await uploadToCloudinary(file, 'florieren/library');
    const item = await this.prisma.libraryResource.create({ 
      data: { 
        title: body.course, 
        description: body.about, 
        staffId: staff!.id, 
        classRoomId: classRoom?.id,
        subjectId: subject?.id,
        file: fileUrl, 
        status: 'PENDING'
      } 
    });
    return this.ok({ id: item.id.toString() }, 'Document uploaded successfully');
  }

  async deleteLibrary(user: any, id: number) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const item = await this.prisma.libraryResource.findUnique({ where: { id: BigInt(id) } });
    if (!item) throw new NotFoundException('Document not found');
    if (item.staffId !== staff?.id) throw new ForbiddenException('You can only delete your own documents');
    await this.prisma.libraryResource.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Document deleted successfully');
  }

  async getClasses(user: any) {
    const schoolId = this.schoolId(user);
    return { success: true, data: await this.prisma.classRoom.findMany({ where: { ...(schoolId ? { schoolId } : {}) }, orderBy: { name: 'asc' } }) };
  }

  async getCourses(user: any) {
    const schoolId = this.schoolId(user);
    const courses = await this.prisma.subject.findMany({ where: { ...(schoolId ? { classRoom: { schoolId } } : {}) }, orderBy: { name: 'asc' } });
    return { success: true, data: courses.map(c => ({ course_id: c.id.toString(), course: c.name })) };
  }

  async getSchoolDays() {
    return { success: true, data: await this.prisma.schoolDays.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  async getNotifications(user: any) {
    return { success: true, data: await this.prisma.notification.findMany({ where: { userId: BigInt(user.id) }, orderBy: { createdAt: 'desc' } }) };
  }

  async markNotificationsRead(user: any) {
    await this.prisma.notification.updateMany({ where: { userId: BigInt(user.id), readAt: null }, data: { readAt: new Date() } });
    return { success: true, data: null, message: 'Notifications marked as read' };
  }

  async getClassTimetables(user: any) {
    const schoolId = this.schoolId(user);
    const rows = await this.prisma.classTimetable.findMany({
      where: schoolId ? { classRoom: { schoolId } } : {},
      include: { classRoom: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.ok(rows.map(r => ({ ...r, id: r.id.toString(), classRoomId: r.classRoomId.toString(), classRoom: r.classRoom?.name })));
  }

  async saveClassTimetable(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const { classRoomId, content, id } = body;
    if (!classRoomId || !content) throw new BadRequestException('classRoomId and content are required');
    if (id) {
      await this.prisma.classTimetable.update({ where: { id: BigInt(id) }, data: { content, staffId: staff?.id } });
      return this.ok(null, 'Class timetable updated');
    }
    await this.prisma.classTimetable.create({ data: { classRoomId: BigInt(classRoomId), content, staffId: staff?.id } });
    return this.ok(null, 'Class timetable created');
  }

  async deleteClassTimetable(user: any, id: string) {
    await this.prisma.classTimetable.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Class timetable deleted');
  }

  async getExamTimetables(user: any) {
    const schoolId = this.schoolId(user);
    const rows = await this.prisma.examTimetable.findMany({
      where: schoolId ? { staff: { user: { schoolId } } } : {},
      orderBy: { createdAt: 'desc' },
    });
    return this.ok(rows.map(r => ({ ...r, id: r.id.toString() })));
  }

  async saveExamTimetable(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const { level, content, id } = body;
    if (!level || !content) throw new BadRequestException('level and content are required');
    if (id) {
      await this.prisma.examTimetable.update({ where: { id: BigInt(id) }, data: { content, staffId: staff?.id } });
      return this.ok(null, 'Exam timetable updated');
    }
    await this.prisma.examTimetable.create({ data: { level, content, staffId: staff?.id } });
    return this.ok(null, 'Exam timetable created');
  }

  async deleteExamTimetable(user: any, id: string) {
    await this.prisma.examTimetable.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Exam timetable deleted');
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ where, include: { subject: true } });
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

  // ── Curriculum ────────────────────────────────────────────────────────────

  async getTopics(user: any, q: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const where: any = { staffId: staff?.id };
    if (q.subjectId) where.subjectId = BigInt(q.subjectId);
    if (q.classRoomId) where.classRoomId = BigInt(q.classRoomId);
    if (q.term) where.term = q.term;
    if (q.session) where.session = q.session;
    const topics = await this.prisma.curriculumTopic.findMany({
      where, orderBy: [{ session: 'desc' }, { term: 'asc' }, { week: 'asc' }],
      include: { subject: true, classRoom: true },
    });
    return this.ok(topics.map(t => ({ ...t, id: t.id.toString(), staffId: t.staffId.toString(), subjectId: t.subjectId?.toString(), classRoomId: t.classRoomId?.toString(), subject: t.subject?.name, classRoom: t.classRoom?.name })));
  }

  async saveTopic(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const data: any = {
      staffId: staff!.id,
      title: body.title,
      description: body.description ?? null,
      week: body.week ? Number(body.week) : null,
      term: body.term ?? null,
      session: body.session ?? null,
      subjectId: this.safeBigInt(body.subjectId),
      classRoomId: this.safeBigInt(body.classRoomId),
    };
    if (body.id) {
      await this.prisma.curriculumTopic.update({ where: { id: BigInt(body.id) }, data });
      return this.ok(null, 'Topic updated');
    }
    const t = await this.prisma.curriculumTopic.create({ data });
    return this.ok({ id: t.id.toString() }, 'Topic created');
  }

  async deleteTopic(user: any, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const topic = await this.prisma.curriculumTopic.findUnique({ where: { id: BigInt(id) } });
    if (!topic || topic.staffId !== staff?.id) throw new NotFoundException('Topic not found');
    await this.prisma.curriculumTopic.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Topic deleted');
  }

  async getLessonPlans(user: any, q: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const where: any = { staffId: staff?.id };
    if (q.topicId) where.topicId = BigInt(q.topicId);
    if (q.subjectId) where.subjectId = BigInt(q.subjectId);
    if (q.classRoomId) where.classRoomId = BigInt(q.classRoomId);
    const plans = await this.prisma.lessonPlan.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { topic: true, subject: true, classRoom: true },
    });
    return this.ok(plans.map(p => ({ ...p, id: p.id.toString(), staffId: p.staffId.toString(), topicId: p.topicId?.toString(), subjectId: p.subjectId?.toString(), classRoomId: p.classRoomId?.toString(), topic: p.topic?.title, subject: p.subject?.name, classRoom: p.classRoom?.name })));
  }

  async saveLessonPlan(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const data: any = {
      staffId: staff!.id,
      title: body.title,
      objectives: body.objectives ?? null,
      content: body.content ?? null,
      resources: body.resources ?? null,
      evaluation: body.evaluation ?? null,
      date: body.date ? new Date(body.date) : null,
      duration: body.duration ? Number(body.duration) : null,
      topicId: this.safeBigInt(body.topicId),
      subjectId: this.safeBigInt(body.subjectId),
      classRoomId: this.safeBigInt(body.classRoomId),
    };
    if (body.id) {
      await this.prisma.lessonPlan.update({ where: { id: BigInt(body.id) }, data });
      return this.ok(null, 'Lesson plan updated');
    }
    const p = await this.prisma.lessonPlan.create({ data });
    return this.ok({ id: p.id.toString() }, 'Lesson plan created');
  }

  async deleteLessonPlan(user: any, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const plan = await this.prisma.lessonPlan.findUnique({ where: { id: BigInt(id) } });
    if (!plan || plan.staffId !== staff?.id) throw new NotFoundException('Lesson plan not found');
    await this.prisma.lessonPlan.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Lesson plan deleted');
  }

  async getWeeklySchemes(user: any, q: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const where: any = { staffId: staff?.id };
    if (q.subjectId) where.subjectId = BigInt(q.subjectId);
    if (q.classRoomId) where.classRoomId = BigInt(q.classRoomId);
    if (q.term) where.term = q.term;
    if (q.session) where.session = q.session;
    const schemes = await this.prisma.weeklyScheme.findMany({
      where, orderBy: [{ session: 'desc' }, { term: 'asc' }, { week: 'asc' }],
      include: { subject: true, classRoom: true },
    });
    return this.ok(schemes.map(s => ({ ...s, id: s.id.toString(), staffId: s.staffId.toString(), subjectId: s.subjectId?.toString(), classRoomId: s.classRoomId?.toString(), subject: s.subject?.name, classRoom: s.classRoom?.name })));
  }

  async saveWeeklyScheme(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const data: any = {
      staffId: staff!.id,
      week: Number(body.week),
      term: body.term,
      session: body.session,
      content: body.content,
      subjectId: this.safeBigInt(body.subjectId),
      classRoomId: this.safeBigInt(body.classRoomId),
    };
    if (body.id) {
      await this.prisma.weeklyScheme.update({ where: { id: BigInt(body.id) }, data });
      return this.ok(null, 'Weekly scheme updated');
    }
    const s = await this.prisma.weeklyScheme.create({ data });
    return this.ok({ id: s.id.toString() }, 'Weekly scheme created');
  }

  async deleteWeeklyScheme(user: any, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const scheme = await this.prisma.weeklyScheme.findUnique({ where: { id: BigInt(id) } });
    if (!scheme || scheme.staffId !== staff?.id) throw new NotFoundException('Weekly scheme not found');
    await this.prisma.weeklyScheme.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Weekly scheme deleted');
  }

  async getTraits(user: any, q: any) {
    const session = q.session || await this.getCurrentSession(user);
    const term = q.term || await this.getCurrentTerm(user);
    const schoolId = this.schoolId(user);

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    if (!sessionEntity || !termEntity) throw new BadRequestException('Session or Term not found');

    const students = await this.prisma.student.findMany({
      where: { classRoom: { name: q.class, ...(schoolId ? { schoolId } : {}) }, user: { status: 'ACTIVE' } },
      include: { user: true, traits: { where: { sessionId: sessionEntity.id, termId: termEntity.id } } },
    });

    return this.ok(students.map(s => ({
      student_id: s.user.uniqueId,
      firstname: s.user.firstName,
      lastname: s.user.lastName,
      image: s.user.image,
      ...(s.traits[0] ? this.serializeTrait(s.traits[0]) : {}),
    })));
  }

  async saveTraits(user: any, body: any) {
    const session = body.session || await this.getCurrentSession(user);
    const term = body.term || await this.getCurrentTerm(user);
    const schoolId = this.schoolId(user);

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    if (!sessionEntity || !termEntity) throw new BadRequestException('Session or Term not found');

    const TRAIT_FIELDS = [
      'punctuality','perseverance','responsibility','diligence','selfControl',
      'honesty','attendance','attentiveness','creativity','curiosity',
      'drawing','physicalActivity','accuracy','handlingOfTools','mentalSkills',
    ];

    let count = 0;
    for (const row of (body.traits ?? [])) {
      const student = await this.prisma.student.findFirst({
        where: { user: { uniqueId: row.student_id, ...(schoolId ? { schoolId } : {}) } },
      });
      if (!student) continue;

      const data: any = {};
      for (const f of TRAIT_FIELDS) {
        if (row[f] !== undefined) data[f] = Math.min(5, Math.max(0, Number(row[f]) || 0));
      }

      await this.prisma.studentTrait.upsert({
        where: { studentId_sessionId_termId: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id } },
        update: data,
        create: { studentId: student.id, sessionId: sessionEntity.id, termId: termEntity.id, ...data },
      });
      count++;
    }
    return this.ok({ count }, `Traits saved for ${count} student(s)`);
  }

  private serializeTrait(t: any) {
    return {
      punctuality: t.punctuality, perseverance: t.perseverance, responsibility: t.responsibility,
      diligence: t.diligence, selfControl: t.selfControl, honesty: t.honesty,
      attendance: t.attendance, attentiveness: t.attentiveness, creativity: t.creativity, curiosity: t.curiosity,
      drawing: t.drawing, physicalActivity: t.physicalActivity, accuracy: t.accuracy,
      handlingOfTools: t.handlingOfTools, mentalSkills: t.mentalSkills,
    };
  }
}
