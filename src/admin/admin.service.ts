import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async dashboard() {
    const [totalStudents, verifiedStudents, pendingStudents, totalStaff, verifiedStaff, session, term, recentStudents, recentPayments, grouped] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.users.count({ where: { admin_verify: '1' } }),
      this.prisma.users.count({ where: { admin_verify: '0' } }),
      this.prisma.staff.count(),
      this.prisma.staff.count({ where: { admin_verify: '1' } }),
      this.prisma.set_session_tbl.findFirst(),
      this.prisma.set_term_tbl.findFirst(),
      this.prisma.users.findMany({ orderBy: { user_id: 'desc' }, take: 3, select: { firstname: true, lastname: true, date: true } }),
      this.prisma.scratch_card.findMany({ orderBy: { scratch_card_id: 'desc' }, take: 3, select: { student_id: true, date: true } }),
      this.prisma.users.groupBy({ by: ['class'], _count: { _all: true } }),
    ]);
    const studentsByClass = grouped.map((row: any) => ({ class: row.class, count: row._count?._all ?? 0 }));
    return this.ok({
      students: { total: totalStudents, verified: verifiedStudents, pending: pendingStudents },
      staff: { total: totalStaff, verified: verifiedStaff },
      studentsByClass,
      current_session: session?.set_session,
      current_term: term?.set_term,
      recentStudents,
      recentPayments,
    });
  }

  async getStudents(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const where: any = {};
    if (q.class) where.class = q.class;
    if (q.status === '1' || q.status === '0') where.admin_verify = q.status;
    if (q.search) {
      where.OR = ['firstname', 'lastname', 'student_id', 'email'].map(field => ({ [field]: { contains: q.search } }));
    }
    const [total, students] = await Promise.all([
      this.prisma.users.count({ where }),
      this.prisma.users.findMany({
        where,
        orderBy: { user_id: 'desc' },
        take: perPage,
        skip: (page - 1) * perPage,
        select: { student_id: true, firstname: true, lastname: true, email: true, class: true, image: true, admin_verify: true },
      }),
    ]);
    return { success: true, data: students, meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage) } };
  }

  async createStudent(data: any) {
    const studentId = await this.generateStudentId();
    await this.prisma.users.create({ data: this.studentData({
      student_id: studentId,
      firstname: data.firstname || '',
      lastname: data.lastname || '',
      email: data.email || '',
      telephone: data.telephone || '',
      class: data.class || '',
      image: 'image.png',
      password: await bcrypt.hash(data.password || 'greatkings', 10),
      admin_verify: '1',
    }) });
    return this.ok({ student_id: studentId }, 'Student created successfully');
  }

  async updateStudent(studentId: string, data: any) {
    const student = await this.prisma.users.findFirst({ where: { student_id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    const update = this.pick(data, ['firstname', 'lastname', 'email', 'telephone', 'class', 'date_of_birth', 'state_of_origin', 'home_address', 'father_name', 'mother_name']);
    if (Object.keys(update).length) await this.prisma.users.updateMany({ where: { student_id: studentId }, data: update });
    return this.ok(null, 'Student updated successfully');
  }

  async verifyStudent(studentId: string) {
    await this.prisma.users.updateMany({ where: { student_id: studentId }, data: { admin_verify: '1' } });
    await this.prisma.notifications.create({ data: { user_id: studentId as any, user_type: 'student', title: 'Account Verified', message: 'Your account has been verified. You can now access all features.', is_read: false, created_at: new Date() } });
    return this.ok(null, 'Student verified successfully');
  }

  async bulkVerifyStudents(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No students selected');
    for (const id of ids) await this.verifyStudent(id);
    return this.ok({ count: ids.length }, `${ids.length} student(s) verified successfully`);
  }

  async deleteStudent(studentId: string) {
    const student = await this.prisma.users.findFirst({ where: { student_id: studentId }, select: { user_id: true } });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.users.deleteMany({ where: { user_id: student.user_id } });
    return this.ok(null, 'Student deleted successfully');
  }

  async getStaff(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const [total, staff] = await Promise.all([
      this.prisma.staff.count(),
      this.prisma.staff.findMany({ orderBy: { staff_id: 'desc' }, take: perPage, skip: (page - 1) * perPage }),
    ]);
    return { success: true, data: staff, meta: { total, page, per_page: perPage } };
  }

  async createStaff(data: any) {
    const uniqueId = await this.generateStaffId();
    await this.prisma.staff.create({ data: this.staffData({
      unique_id: uniqueId,
      firstname: data.firstname || '',
      lastname: data.lastname || '',
      email: data.email || '',
      telephone: data.telephone || '',
      class: data.class || '',
      password: await bcrypt.hash(data.password || 'greatkings', 10),
      image: 'image.png',
      admin_verify: '1',
    }) });
    return this.ok({ unique_id: uniqueId }, 'Staff created successfully');
  }

  async updateStaff(staffId: string, data: any) {
    const update = this.pick(data, ['firstname', 'lastname', 'email', 'telephone', 'class']);
    if (Object.keys(update).length) await this.prisma.staff.updateMany({ where: { unique_id: staffId }, data: update });
    return this.ok(null, 'Staff updated successfully');
  }

  async verifyStaff(staffId: string) {
    await this.prisma.staff.updateMany({ where: { unique_id: staffId }, data: { admin_verify: '1' } });
    return this.ok(null, 'Staff verified successfully');
  }

  async deleteStaff(staffId: string) {
    await this.prisma.staff.deleteMany({ where: { unique_id: staffId } });
    return this.ok(null, 'Staff deleted successfully');
  }

  async getSessions() {
    const [sessions, current] = await Promise.all([
      this.prisma.session.findMany({ orderBy: { session: 'desc' } }),
      this.prisma.set_session_tbl.findFirst(),
    ]);
    return this.ok(sessions.map(s => ({ ...s, current: s.session === current?.set_session })));
  }

  async createSession(session: string) {
    if (!session) throw new BadRequestException('Session is required');
    await this.prisma.session.create({ data: { session } });
    return this.ok(null, 'Session created successfully');
  }

  async setCurrentSession(session: string) {
    await this.prisma.set_session_tbl.updateMany({ where: {}, data: { set_session: session } });
    return this.ok(null, 'Current session updated successfully');
  }

  async deleteSession(session: string) {
    await this.prisma.session.deleteMany({ where: { session } });
    return this.ok(null, 'Session deleted successfully');
  }

  async getTerms() {
    const [terms, current] = await Promise.all([
      this.prisma.term.findMany({ orderBy: { term_id: 'asc' } }),
      this.prisma.set_term_tbl.findFirst(),
    ]);
    return this.ok(terms.map(t => ({ ...t, current: t.term === current?.set_term })));
  }

  async setCurrentTerm(term: string) {
    await this.prisma.set_term_tbl.updateMany({ where: {}, data: { set_term: term } });
    return this.ok(null, 'Current term updated successfully');
  }

  async getPendingPayments() {
    const payments = await this.prisma.scratch_card.findMany({
      where: { OR: [{ verified: 'no' }, { verified: '' }, { verified: null }] },
      orderBy: { scratch_card_id: 'desc' },
    });
    return this.ok(await this.withStudentInfo(payments));
  }

  async verifyPayment(id: number) {
    const payment = await this.prisma.scratch_card.findFirst({ where: { scratch_card_id: id }, select: { scratch_card_id: true } });
    if (!payment) throw new NotFoundException('Payment record not found.');
    await this.prisma.scratch_card.updateMany({ where: { scratch_card_id: id }, data: { verified: 'yes', admin_date: String(new Date()) } });
    return this.ok(null, 'Payment verified successfully');
  }

  async getLibrary() {
    const library = await this.prisma.library.findMany({ orderBy: [{ verify: 'asc' }, { date: 'desc' }] });
    return this.ok(await this.withStaffNames(library));
  }

  async approveLibrary(id: number) {
    await this.prisma.library.updateMany({ where: { library_id: id }, data: { verify: '1' } });
    return this.ok(null, 'Book approved successfully');
  }

  async deleteLibrary(id: number) {
    await this.prisma.library.deleteMany({ where: { library_id: id } });
    return this.ok(null, 'Book deleted successfully');
  }

  async getClasses() {
    const classes = await this.prisma.renamedclass.findMany({ orderBy: { class_id: 'asc' } });
    const staff = await this.prisma.staff.findMany({ select: { unique_id: true, firstname: true, lastname: true } });
    const byId = new Map(staff.map(s => [s.unique_id, s]));
    const data = await Promise.all(classes.map(async cls => {
      const teacher = byId.get(cls.class_teacher);
      return { ...cls, teacher_name: teacher ? `${teacher.firstname} ${teacher.lastname}` : null, student_count: await this.prisma.users.count({ where: { class: cls.class } }) };
    }));
    return this.ok(data);
  }

  async createClass(data: any) {
    await this.prisma.renamedclass.create({ data: { class: data.class, class_teacher: data.class_teacher || '' } });
    return this.ok(null, 'Class created successfully');
  }

  async updateClass(oldName: string, data: any) {
    await this.prisma.renamedclass.updateMany({ where: { class: oldName }, data: { class: data.class, class_teacher: data.class_teacher || '' } });
    return this.ok(null, 'Class updated successfully');
  }

  async deleteClass(name: string) {
    await this.prisma.renamedclass.deleteMany({ where: { class: name } });
    return this.ok(null, 'Class deleted successfully');
  }

  async getCourses() {
    const courses = await this.prisma.course.findMany({ orderBy: { courses: 'asc' } });
    return this.ok(courses.map(c => ({ course_id: c.course_id, course: c.courses, teacher: c.teacher })));
  }

  async createCourse(data: any) {
    await this.prisma.course.create({ data: { courses: data.course, teacher: data.teacher || '' } });
    return this.ok(null, 'Course created successfully');
  }

  async updateCourse(oldName: string, data: any) {
    await this.prisma.course.updateMany({ where: { courses: oldName }, data: { courses: data.course, teacher: data.teacher || '' } });
    return this.ok(null, 'Course updated successfully');
  }

  async deleteCourse(name: string) {
    await this.prisma.course.deleteMany({ where: { courses: name } });
    return this.ok(null, 'Course deleted successfully');
  }

  async getResults(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    const where: any = { session, term };
    const usersWhere: any = q.class ? { class: q.class } : {};
    const [resultRows, users, classes, sessions] = await Promise.all([
      this.prisma.result.findMany({ where }),
      this.prisma.users.findMany({ where: usersWhere, select: { student_id: true, firstname: true, lastname: true, class: true, image: true } }),
      this.prisma.renamedclass.findMany({ orderBy: { class_id: 'asc' } }),
      this.prisma.session.findMany({ orderBy: { session: 'desc' }, select: { session: true } }),
    ]);
    const byStudent = new Map(users.map(u => [u.student_id, u]));
    const grouped = new Map<string, any[]>();
    for (const row of resultRows) {
      if (!byStudent.has(row.student_id)) continue;
      grouped.set(row.student_id, [...(grouped.get(row.student_id) ?? []), row]);
    }
    const students = [...grouped.entries()].map(([student_id, rows]) => {
      const student = byStudent.get(student_id);
      const totals = rows.map(r => parseFloat(r.total_score) || (parseFloat(r.test_score) || 0) + (parseFloat(r.exam_score) || 0));
      return {
        ...student,
        student_id,
        subject_count: rows.length,
        average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0,
        approved: rows[0]?.approved,
      };
    }).sort((a, b) => `${a.class}${a.firstname}`.localeCompare(`${b.class}${b.firstname}`));
    return this.ok({ students, classes, sessions, current_session: session, current_term: term });
  }

  async getStudentResults(studentId: string, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    const student = await this.prisma.users.findFirst({ where: { student_id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    const [results, attendance] = await Promise.all([
      this.resultsWithTotals({ student_id: studentId, session, term }),
      this.prisma.attendance.findFirst({ where: { student_id: studentId, session, term } }),
    ]);
    return this.ok({ student, results, attendance, session, term });
  }

  async approveResults(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    await this.prisma.result.updateMany({ where: { student_id: studentId, session, term }, data: { approved: '1' } });
    await this.prisma.notifications.create({ data: { user_id: studentId as any, user_type: 'student', title: 'Results Approved', message: `Your result for ${term} term, ${session} session has been approved.`, is_read: false, created_at: new Date() } });
    return this.ok(null, 'Results approved successfully');
  }

  async unapproveResults(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    await this.prisma.result.updateMany({ where: { student_id: studentId, session, term }, data: { approved: '0' } });
    await this.prisma.notifications.create({ data: { user_id: studentId as any, user_type: 'student', title: 'Results Unapproved', message: `Your result for ${term} term, ${session} session has been unapproved.`, is_read: false, created_at: new Date() } });
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
    const comment = body.principal_comment || body.comment || '';
    const existing = await this.prisma.attendance.findFirst({ where: { student_id: studentId, session, term }, select: { attendance_id: true } });
    if (existing) {
      await this.prisma.attendance.updateMany({ where: { student_id: studentId, session, term }, data: { principal_comment: comment } });
    } else {
      await this.prisma.attendance.create({ data: this.attendanceData({ student_id: studentId, session, term, principal_comment: comment, present: '0', absent: '0' }) });
    }
    return this.ok({ student_id: studentId, session, term, principal_comment: comment }, 'Comment updated successfully');
  }

  async getSchoolDays() {
    return this.ok(await this.prisma.school_days.findMany({ orderBy: [{ session: 'desc' }, { term: 'asc' }] }));
  }

  async setSchoolDays(body: any) {
    const { session, term, total_days } = body;
    if (!session || !term || !total_days) throw new BadRequestException('Session, term, and total_days are required');
    const existing = await this.prisma.school_days.findFirst({ where: { session, term }, select: { id: true } });
    if (existing) await this.prisma.school_days.updateMany({ where: { session, term }, data: { total_days: Number(total_days) } });
    else await this.prisma.school_days.create({ data: { session, term, total_days: Number(total_days) } });
    return this.ok(null, 'School days set successfully');
  }

  async deleteSchoolDays(session: string, term: string) {
    await this.prisma.school_days.deleteMany({ where: { session, term } });
    return this.ok(null, 'School days deleted successfully');
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.set_session_tbl.findFirst();
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.set_term_tbl.findFirst();
    return r?.set_term || '';
  }

  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.prisma.users.findFirst({ orderBy: { user_id: 'desc' }, select: { student_id: true } });
    const num = last ? parseInt(last.student_id.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `GKA${year}${String(num).padStart(4, '0')}`;
  }

  private async generateStaffId(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.prisma.staff.findFirst({ orderBy: { staff_id: 'desc' }, select: { unique_id: true } });
    const num = last ? parseInt(last.unique_id.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
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
    const rows = await this.prisma.result.findMany({ where });
    return rows.map(row => ({ ...row, total_score: (parseFloat(row.test_score) || 0) + (parseFloat(row.exam_score) || 0) }));
  }

  private async withStudentInfo<T extends { student_id?: string }>(items: T[]) {
    const ids = [...new Set(items.map(item => item.student_id).filter(Boolean))];
    const users = await this.prisma.users.findMany({ where: { student_id: { in: ids } }, select: { student_id: true, firstname: true, lastname: true, class: true } });
    const byId = new Map(users.map(u => [u.student_id, u]));
    return items.map(item => ({ ...item, firstname: byId.get(item.student_id)?.firstname, lastname: byId.get(item.student_id)?.lastname, class: byId.get(item.student_id)?.class ?? (item as any).class }));
  }

  private async withStaffNames<T extends { staff_id?: string }>(items: T[]) {
    const ids = [...new Set(items.map(item => item.staff_id).filter(Boolean))];
    const staff = await this.prisma.staff.findMany({ where: { unique_id: { in: ids } }, select: { unique_id: true, firstname: true, lastname: true } });
    const byId = new Map(staff.map(s => [s.unique_id, s]));
    return items.map(item => ({ ...item, firstname: byId.get(item.staff_id)?.firstname, lastname: byId.get(item.staff_id)?.lastname }));
  }

  private studentData(data: any) {
    return {
      student_id: data.student_id || '',
      firstname: data.firstname || '',
      middlename: data.middlename || '',
      lastname: data.lastname || '',
      father_name: data.father_name || '',
      mother_name: data.mother_name || '',
      image: data.image || 'image.png',
      parent_image: data.parent_image || '',
      email: data.email || '',
      telephone: data.telephone || '',
      class: data.class || '',
      date_of_birth: data.date_of_birth || '',
      state_of_origin: data.state_of_origin || '',
      home_address: data.home_address || '',
      about: data.about || '',
      year_of_admission: data.year_of_admission || '',
      password: data.password || '',
      admin_verify: data.admin_verify || '0',
      email_verify: data.email_verify || '',
      v_email: data.v_email || '',
      updated: data.updated || '',
      status: data.status || 'active',
      school_id: data.school_id,
      last_login: data.last_login,
    };
  }

  private staffData(data: any) {
    return {
      unique_id: data.unique_id || '',
      firstname: data.firstname || '',
      lastname: data.lastname || '',
      image: data.image || 'image.png',
      email: data.email || '',
      telephone: data.telephone || '',
      class: data.class || '',
      state_of_origin: data.state_of_origin || '',
      date_of_birth: data.date_of_birth || '',
      home_address: data.home_address || '',
      about: data.about || '',
      user: data.user || 'staff',
      password: data.password || '',
      admin_verify: data.admin_verify || '0',
      email_verify: data.email_verify || '',
      v_email: data.v_email || '',
      date: data.date || String(new Date()),
      updated: data.updated || '',
      role: data.role || 'staff',
      school_id: data.school_id,
    };
  }

  private attendanceData(data: any) {
    return {
      student_id: data.student_id || '',
      present: String(data.present ?? '0'),
      absent: String(data.absent ?? '0'),
      comment: data.comment || '',
      principal_comment: data.principal_comment || '',
      date: data.date || String(new Date()),
      term: data.term || '',
      session: data.session || '',
      type: data.type || '',
    };
  }
}
