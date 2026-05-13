import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async dashboard() {
    const [totalStudents, activeStudents, pendingStudents, totalStaff, activeStaff, session, term, recentUsers, recentPayments, grouped] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'PENDING' } }),
      this.prisma.user.count({ where: { role: 'STAFF' } }),
      this.prisma.user.count({ where: { role: 'STAFF', status: 'ACTIVE' } }),
      this.prisma.academicSession.findFirst({ where: { isCurrent: true } }),
      this.prisma.academicTerm.findFirst({ where: { isCurrent: true } }),
      this.prisma.user.findMany({ where: { role: 'STUDENT' }, orderBy: { createdAt: 'desc' }, take: 3, select: { firstName: true, lastName: true, createdAt: true } }),
      this.prisma.schoolFeePayment.findMany({ orderBy: { createdAt: 'desc' }, take: 3, include: { student: { include: { user: true } } } }),
      this.prisma.student.groupBy({ by: ['classRoomId'], _count: { _all: true } }),
    ]);

    const classRooms = await this.prisma.classRoom.findMany();
    const classMap = new Map(classRooms.map(c => [c.id.toString(), c.name]));
    
    const studentsByClass = grouped.map((row: any) => ({ 
      class: row.classRoomId ? classMap.get(row.classRoomId.toString()) : 'Unknown', 
      count: row._count?._all ?? 0 
    }));

    return this.ok({
      students: { total: totalStudents, verified: activeStudents, pending: pendingStudents },
      staff: { total: totalStaff, verified: activeStaff },
      studentsByClass,
      current_session: session?.name,
      current_term: term?.name,
      recentStudents: recentUsers.map(u => ({ firstname: u.firstName, lastname: u.lastName, date: u.createdAt })),
      recentPayments: recentPayments.map(p => ({ student_id: p.student.user.uniqueId, date: p.createdAt })),
    });
  }

  async getStudents(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const where: any = { role: 'STUDENT' };
    
    if (q.class) {
      where.student = { classRoom: { name: q.class } };
    }
    
    if (q.status === '1') where.status = 'ACTIVE';
    else if (q.status === '0') where.status = 'PENDING';
    
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { uniqueId: { contains: q.search } },
        { email: { contains: q.search } },
      ];
    }

    const [total, students] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: perPage,
        skip: (page - 1) * perPage,
        include: { student: { include: { classRoom: true } } },
      }),
    ]);

    const data = students.map(s => ({
      student_id: s.uniqueId,
      firstname: s.firstName,
      lastname: s.lastName,
      email: s.email,
      class: s.student?.classRoom?.name || '',
      image: s.image,
      admin_verify: s.status === 'ACTIVE' ? '1' : '0',
    }));

    return { success: true, data, meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage) } };
  }

  async createStudent(data: any) {
    const studentId = await this.generateStudentId();
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: data.class } });
    
    await this.prisma.user.create({ 
      data: {
        uniqueId: studentId,
        role: 'STUDENT',
        firstName: data.firstname || '',
        lastName: data.lastname || '',
        email: data.email || '',
        telephone: data.telephone || '',
        password: await bcrypt.hash(data.password || 'greatkings', 10),
        image: 'image.png',
        status: 'ACTIVE',
        student: {
          create: {
            studentNo: studentId,
            classRoomId: classRoom?.id,
          } as any
        }
      }
    });
    return this.ok({ student_id: studentId }, 'Student created successfully');
  }

  async updateStudent(studentId: string, data: any) {
    const user = await this.prisma.user.findFirst({ where: { uniqueId: studentId } });
    if (!user) throw new NotFoundException('Student not found');
    
    const userUpdate = this.pick(data, ['firstName', 'lastName', 'email', 'telephone']);
    const studentUpdate = this.pick(data, ['dateOfBirth', 'stateOfOrigin', 'homeAddress', 'fatherName', 'motherName']);
    
    if (data.class) {
      const classRoom = await this.prisma.classRoom.findFirst({ where: { name: data.class } });
      if (classRoom) studentUpdate.classRoomId = classRoom.id;
    }

    await this.prisma.user.update({
      where: { uniqueId: studentId },
      data: {
        ...userUpdate,
        student: { update: studentUpdate }
      }
    });
    return this.ok(null, 'Student updated successfully');
  }

  async verifyStudent(studentId: string) {
    const user = await this.prisma.user.update({ 
      where: { uniqueId: studentId }, 
      data: { status: 'ACTIVE' } 
    });
    
    await this.prisma.notification.create({ 
      data: { 
        userId: user.id, 
        title: 'Account Verified', 
        message: 'Your account has been verified. You can now access all features.', 
        readAt: null 
      } 
    });
    return this.ok(null, 'Student verified successfully');
  }

  async bulkVerifyStudents(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No students selected');
    for (const id of ids) await this.verifyStudent(id);
    return this.ok({ count: ids.length }, `${ids.length} student(s) verified successfully`);
  }

  async deleteStudent(studentId: string) {
    const user = await this.prisma.user.findUnique({ where: { uniqueId: studentId } });
    if (!user) throw new NotFoundException('Student not found');
    await this.prisma.user.delete({ where: { id: user.id } });
    return this.ok(null, 'Student deleted successfully');
  }

  async getStaff(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const where: any = { role: { in: ['STAFF', 'ADMIN'] } };
    
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { uniqueId: { contains: q.search } },
        { email: { contains: q.search } },
      ];
    }

    const [total, staff] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ 
        where, 
        orderBy: { createdAt: 'desc' }, 
        take: perPage, 
        skip: (page - 1) * perPage,
        include: { staff: true }
      }),
    ]);

    const data = staff.map(s => ({
      staff_id: s.id.toString(),
      unique_id: s.uniqueId,
      firstname: s.firstName,
      lastname: s.lastName,
      email: s.email,
      telephone: s.telephone,
      image: s.image,
      admin_verify: s.status === 'ACTIVE' ? '1' : '0',
      role: s.role,
    }));

    return { success: true, data, meta: { total, page, per_page: perPage } };
  }

  async createStaff(data: any) {
    const uniqueId = await this.generateStaffId();
    await this.prisma.user.create({ 
      data: {
        uniqueId: uniqueId,
        role: (data.role?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'STAFF') as any,
        firstName: data.firstname || '',
        lastName: data.lastname || '',
        email: data.email || '',
        telephone: data.telephone || '',
        password: await bcrypt.hash(data.password || 'greatkings', 10),
        image: 'image.png',
        status: 'ACTIVE',
        staff: {
          create: {
            staffNo: uniqueId,
          }
        }
      }
    });
    return this.ok({ unique_id: uniqueId }, 'Staff created successfully');
  }

  async updateStaff(staffId: string, data: any) {
    const userUpdate = this.pick(data, ['firstName', 'lastName', 'email', 'telephone']);
    if (Object.keys(userUpdate).length) {
      await this.prisma.user.update({ where: { uniqueId: staffId }, data: userUpdate });
    }
    return this.ok(null, 'Staff updated successfully');
  }

  async verifyStaff(staffId: string) {
    await this.prisma.user.update({ where: { uniqueId: staffId }, data: { status: 'ACTIVE' } });
    return this.ok(null, 'Staff verified successfully');
  }

  async deleteStaff(staffId: string) {
    await this.prisma.user.delete({ where: { uniqueId: staffId } });
    return this.ok(null, 'Staff deleted successfully');
  }

  async getSessions() {
    const [sessions, current] = await Promise.all([
      this.prisma.academicSession.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.academicSession.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);
    return this.ok(sessions.map(s => ({ ...s, id: s.id.toString(), session: s.name, current: s.id === current?.id })));
  }

  async createSession(name: string) {
    if (!name) throw new BadRequestException('Session name is required');
    await this.prisma.academicSession.create({ data: { name } });
    return this.ok(null, 'Session created successfully');
  }

  async setCurrentSession(name: string) {
    await this.prisma.academicSession.updateMany({ data: { isCurrent: false } });
    await this.prisma.academicSession.update({ where: { name }, data: { isCurrent: true } });
    return this.ok(null, 'Current session updated successfully');
  }

  async deleteTerm(id: string) {
    await this.prisma.academicTerm.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Term deleted successfully');
  }

  async updateTerm(id: string, data: { name?: string }) {
    await this.prisma.academicTerm.update({ where: { id: BigInt(id) }, data: { ...(data.name && { name: data.name as any }) } });
    return this.ok(null, 'Term updated successfully');
  }

  async deleteSession(name: string) {
    await this.prisma.academicSession.deleteMany({ where: { name } });
    return this.ok(null, 'Session deleted successfully');
  }

  async getTerms() {
    const terms = await this.prisma.academicTerm.findMany({
      orderBy: { createdAt: 'asc' },
      include: { session: true },
    });
    return this.ok(terms.map(t => ({ ...t, id: t.id.toString(), term: t.name, sessionName: t.session?.name })));
  }

  async setCurrentTerm(termId: string) {
    const term = await this.prisma.academicTerm.findUnique({ where: { id: BigInt(termId) } });
    if (!term) throw new BadRequestException('Term not found');
    await this.prisma.academicTerm.updateMany({ where: { sessionId: term.sessionId }, data: { isCurrent: false } });
    await this.prisma.academicTerm.update({ where: { id: BigInt(termId) }, data: { isCurrent: true } });
    return this.ok(null, 'Current term updated successfully');
  }

  async getAllPayments(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const limit = parseInt(q.limit) || 20;
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
    if (q.class) {
      const classRoom = await this.prisma.classRoom.findFirst({ where: { name: q.class } });
      if (classRoom) where.student = { classRoomId: classRoom.id };
    }
    const [total, payments] = await Promise.all([
      this.prisma.schoolFeePayment.count({ where }),
      this.prisma.schoolFeePayment.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: { student: { include: { user: true } } },
      }),
    ]);
    return { success: true, data: payments.map(p => ({
      ...p, id: p.id.toString(),
      student_id: p.student.user.uniqueId,
      firstname: p.student.user.firstName,
      lastname: p.student.user.lastName,
    })), meta: { total, page, per_page: limit, last_page: Math.ceil(total / limit) } };
  }

  async getPendingPayments() {
    const payments = await this.prisma.schoolFeePayment.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { student: { include: { user: true } } }
    });
    return this.ok(payments.map(p => ({
      ...p,
      id: p.id.toString(),
      student_id: p.student.user.uniqueId,
      firstname: p.student.user.firstName,
      lastname: p.student.user.lastName,
    })));
  }

  async verifyPayment(id: string) {
    await this.prisma.schoolFeePayment.update({
      where: { id: BigInt(id) },
      data: { status: 'SUCCESS', paidAt: new Date() }
    });
    return this.ok(null, 'Payment verified successfully');
  }

  async getLibrary() {
    const library = await this.prisma.libraryResource.findMany({ 
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { staff: { include: { user: true } } }
    });
    return this.ok(library.map(l => ({
      ...l,
      id: l.id.toString(),
      firstname: l.staff?.user.firstName,
      lastname: l.staff?.user.lastName,
    })));
  }

  async approveLibrary(id: string) {
    await this.prisma.libraryResource.update({
      where: { id: BigInt(id) },
      data: { status: 'APPROVED' }
    });
    return this.ok(null, 'Book approved successfully');
  }

  async deleteLibrary(id: string) {
    await this.prisma.libraryResource.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Book deleted successfully');
  }

  async getClasses() {
    const classes = await this.prisma.classRoom.findMany({ 
      orderBy: { name: 'asc' },
      include: { 
        classTeacher: { include: { user: true } },
        _count: { select: { students: true } }
      }
    });
    return this.ok(classes.map(c => ({
      ...c,
      id: c.id.toString(),
      class: c.name,
      teacher_name: c.classTeacher ? `${c.classTeacher.user.firstName} ${c.classTeacher.user.lastName}` : null,
      student_count: c._count.students,
    })));
  }

  async createClass(data: any) {
    const teacher = await this.prisma.staff.findFirst({ where: { staffNo: data.class_teacher } });
    await this.prisma.classRoom.create({ 
      data: { 
        name: data.class, 
        classTeacherId: teacher?.id 
      } 
    });
    return this.ok(null, 'Class created successfully');
  }

  async updateClass(oldName: string, data: any) {
    const teacher = await this.prisma.staff.findFirst({ where: { staffNo: data.class_teacher } });
    await this.prisma.classRoom.update({ 
      where: { name: oldName }, 
      data: { 
        name: data.class, 
        classTeacherId: teacher?.id 
      } 
    });
    return this.ok(null, 'Class updated successfully');
  }

  async deleteClass(name: string) {
    await this.prisma.classRoom.delete({ where: { name } });
    return this.ok(null, 'Class deleted successfully');
  }

  async getCourses() {
    const subjects = await this.prisma.subject.findMany({ 
      orderBy: { name: 'asc' },
      include: { teacher: { include: { user: true } } }
    });
    return this.ok(subjects.map(s => ({ 
      course_id: s.id.toString(), 
      course: s.name, 
      teacher: s.teacher ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}` : '' 
    })));
  }

  async createCourse(data: any) {
    await this.prisma.subject.create({ data: { name: data.course } });
    return this.ok(null, 'Course created successfully');
  }

  async updateCourse(oldName: string, data: any) {
    await this.prisma.subject.updateMany({ where: { name: oldName }, data: { name: data.course } });
    return this.ok(null, 'Course updated successfully');
  }

  async deleteCourse(name: string) {
    await this.prisma.subject.deleteMany({ where: { name } });
    return this.ok(null, 'Course deleted successfully');
  }

  async getResults(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    if (!sessionEntity || !termEntity) {
      const [classes, sessions] = await Promise.all([
        this.prisma.classRoom.findMany({ orderBy: { name: 'asc' } }),
        this.prisma.academicSession.findMany({ orderBy: { name: 'desc' } }),
      ]);
      return this.ok({ students: [], classes, sessions, current_session: session, current_term: term });
    }

    const where: any = { sessionId: sessionEntity.id, termId: termEntity.id };
    const userWhere: any = { role: 'STUDENT' };
    if (q.class) {
      userWhere.student = { classRoom: { name: q.class } };
    }

    const [resultRows, users, classes, sessions] = await Promise.all([
      this.prisma.result.findMany({ where }),
      this.prisma.user.findMany({ 
        where: userWhere, 
        select: { uniqueId: true, firstName: true, lastName: true, image: true, student: { include: { classRoom: true } } } 
      }),
      this.prisma.classRoom.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.academicSession.findMany({ orderBy: { name: 'desc' } }),
    ]);

    const byStudent = new Map(users.map(u => [u.uniqueId, u]));
    const grouped = new Map<string, any[]>();
    for (const row of resultRows) {
      const student = users.find(u => u.student?.id === row.studentId);
      if (!student) continue;
      grouped.set(student.uniqueId, [...(grouped.get(student.uniqueId) ?? []), row]);
    }

    const students = [...grouped.entries()].map(([uniqueId, rows]) => {
      const user = byStudent.get(uniqueId);
      const totals = rows.map(r => Number(r.testScore) + Number(r.examScore));
      return {
        student_id: uniqueId,
        firstname: user?.firstName,
        lastname: user?.lastName,
        class: user?.student?.classRoom?.name,
        image: user?.image,
        subject_count: rows.length,
        average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0,
        approved: rows[0]?.approvedAt ? '1' : '0',
      };
    }).sort((a, b) => `${a.class}${a.firstname}`.localeCompare(`${b.class}${b.firstname}`));

    return this.ok({ students, classes, sessions, current_session: session, current_term: term });
  }

  async getStudentResults(studentId: string, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    const user = await this.prisma.user.findUnique({ where: { uniqueId: studentId }, include: { student: true } });

    if (!user || !user.student || !sessionEntity || !termEntity) throw new NotFoundException('Student or Session/Term not found');

    const [results, attendance] = await Promise.all([
      this.resultsWithTotals({ studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id }),
      this.prisma.attendance.findFirst({ where: { studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id } }),
    ]);
    return this.ok({ student: user, results, attendance, session, term });
  }

  async approveResults(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    const user = await this.prisma.user.findUnique({ where: { uniqueId: studentId }, include: { student: true } });

    if (!user || !user.student || !sessionEntity || !termEntity) return;

    await this.prisma.result.updateMany({ 
      where: { studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id }, 
      data: { approvedAt: new Date() } 
    });

    await this.prisma.notification.create({ 
      data: { 
        userId: user.id, 
        title: 'Results Approved', 
        message: `Your result for ${term} term, ${session} session has been approved.`, 
        readAt: null 
      } 
    });
    return this.ok(null, 'Results approved successfully');
  }

  async unapproveResults(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    const user = await this.prisma.user.findUnique({ where: { uniqueId: studentId }, include: { student: true } });

    if (!user || !user.student || !sessionEntity || !termEntity) return;

    await this.prisma.result.updateMany({ 
      where: { studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id }, 
      data: { approvedAt: null } 
    });
    return this.ok(null, 'Results unapproved successfully');
  }

  async bulkApproveResults(body: any) {
    const { student_ids, session: s, term: t } = body;
    if (!student_ids?.length) throw new BadRequestException('No students selected');
    const session = s || await this.getCurrentSession();
    const term = t || await this.getCurrentTerm();
    for (const id of student_ids) await this.approveResults(id, { session, term });
    return this.ok({ approved_count: student_ids.length }, `${student_ids.length} student(s) results approved`);
  }

  async bulkUnapproveResults(body: any) {
    const { student_ids, session: s, term: t } = body;
    if (!student_ids?.length) throw new BadRequestException('No students selected');
    const session = s || await this.getCurrentSession();
    const term = t || await this.getCurrentTerm();
    for (const id of student_ids) await this.unapproveResults(id, { session, term });
    return this.ok({ unapproved_count: student_ids.length }, `${student_ids.length} student(s) results unapproved`);
  }

  async updatePrincipalComment(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    const user = await this.prisma.user.findUnique({ where: { uniqueId: studentId }, include: { student: true } });
    if (!user || !user.student) throw new NotFoundException('Student not found');

    const comment = body.principal_comment || body.comment || '';
    const existing = await this.prisma.attendance.findFirst({ 
      where: { studentId: user.student.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
    });

    if (existing) {
      await this.prisma.attendance.update({ 
        where: { id: existing.id }, 
        data: { principalComment: comment } 
      });
    } else {
      await this.prisma.attendance.create({ 
        data: { 
          studentId: user.student.id, 
          sessionId: sessionEntity!.id, 
          termId: termEntity!.id, 
          principalComment: comment 
        } 
      });
    }
    return this.ok({ student_id: studentId, session, term, principal_comment: comment }, 'Comment updated successfully');
  }

  async getSchoolDays() {
    return this.ok(await this.prisma.schoolDays.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  async setSchoolDays(body: any) {
    const { session, term, total_days } = body;
    if (!session || !term || !total_days) throw new BadRequestException('Session, term, and total_days are required');
    await this.prisma.schoolDays.upsert({
      where: { session_term: { session, term } },
      update: { totalDays: Number(total_days) },
      create: { session, term, totalDays: Number(total_days) }
    });
    return this.ok(null, 'School days set successfully');
  }

  async deleteSchoolDays(session: string, term: string) {
    await this.prisma.schoolDays.deleteMany({ where: { session, term } });
    return this.ok(null, 'School days deleted successfully');
  }

  async getNotifications(user: any) {
    return this.ok(await this.prisma.notification.findMany({ where: { userId: BigInt(user.id) }, orderBy: { createdAt: 'desc' } }));
  }

  async markNotificationsRead(user: any) {
    await this.prisma.notification.updateMany({ where: { userId: BigInt(user.id), readAt: null }, data: { readAt: new Date() } });
    return this.ok(null, 'Notifications marked as read');
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

  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.prisma.user.findFirst({ 
      where: { role: 'STUDENT' }, 
      orderBy: { createdAt: 'desc' }, 
      select: { uniqueId: true } 
    });
    const num = last ? parseInt(last.uniqueId.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `GKA${year}${String(num).padStart(4, '0')}`;
  }

  private async generateStaffId(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.prisma.user.findFirst({ 
      where: { role: 'STAFF' }, 
      orderBy: { createdAt: 'desc' }, 
      select: { uniqueId: true } 
    });
    const num = last ? parseInt(last.uniqueId.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `GKS${year}${String(num).padStart(4, '0')}`;
  }

  private pick(data: any, keys: string[]) {
    const update: any = {};
    keys.forEach(key => {
      if (data[key] !== undefined) update[key] = data[key];
    });
    return update;
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ where, include: { subject: true } });
    return rows.map(row => ({ 
      ...row, 
      id: row.id.toString(),
      course: row.subject.name,
      test_score: row.testScore.toString(),
      exam_score: row.examScore.toString(),
      total_score: (Number(row.testScore) + Number(row.examScore)).toString()
    }));
  }
}
