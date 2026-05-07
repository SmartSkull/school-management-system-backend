import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.findFirst<any>('set_session_tbl');
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.findFirst<any>('set_term_tbl');
    return r?.set_term || '';
  }

  async dashboard(user: any) {
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();
    const studentCount = await this.prisma.count('users', { class: user.class });
    const assignments = await this.prisma.findMany<any>('assignment', { where: { staff_id: user.unique_id }, orderBy: { assignment_id: 'desc' } });
    const libraryItems = await this.prisma.findMany<any>('library', { where: { staff_id: user.unique_id }, orderBy: { library_id: 'desc' } });
    return this.ok({ user, current_session: session, current_term: term, student_count: studentCount, analytics: { assignments: { total: assignments.length, recent: assignments.slice(0, 5) }, library: { total: libraryItems.length, verified: libraryItems.filter((i: any) => i.verify == '1').length, pending: libraryItems.filter((i: any) => i.verify != '1').length } } });
  }

  async profile(user: any) {
    const profile = await this.prisma.findFirst('staff', { where: { unique_id: user.unique_id } });
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstname', 'lastname', 'email', 'telephone', 'date_of_birth', 'state_of_origin', 'home_address'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    if (Object.keys(update).length) await this.prisma.updateMany('staff', { unique_id: user.unique_id }, update);
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    await this.prisma.updateMany('staff', { unique_id: user.unique_id }, { image: file.filename });
    return this.ok({ image: file.filename }, 'Image updated successfully');
  }

  async getStudents(user: any, cls?: string) {
    const targetClass = cls || user.class;
    const students = await this.prisma.findMany('users', { where: { class: targetClass, admin_verify: '1' } });
    return this.ok(students);
  }

  async getStudentDetails(id: string) {
    const student = await this.prisma.findFirst('users', { where: { student_id: id } });
    if (!student) throw new NotFoundException('Student not found');
    return this.ok(student);
  }

  async uploadResult(user: any, body: any) {
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();

    if (Array.isArray(body.results)) {
      let count = 0;
      for (const r of body.results) {
        if (!r.student_id) continue;
        await this.upsertResult({ student_id: r.student_id, course: body.course, session, term, test_score: r.test_score || 0, exam_score: r.exam_score || 0, teacher_id: user.unique_id });
        count++;
      }
      return this.ok({ count }, `Successfully saved ${count} result(s)`);
    }

    await this.upsertResult({ ...body, teacher_id: user.unique_id });
    return this.ok(null, 'Result uploaded successfully');
  }

  private async upsertResult(data: any) {
    const total = (parseFloat(data.test_score) || 0) + (parseFloat(data.exam_score) || 0);
    const where = { student_id: data.student_id, course: data.course, session: data.session, term: data.term };
    const existing = await this.prisma.findFirst('result', { where, select: { result_id: true } });
    if (existing) {
      await this.prisma.updateMany('result', where, { test_score: data.test_score, exam_score: data.exam_score, total_score: String(total), teacher_id: data.teacher_id });
    } else {
      await this.prisma.create('result', { ...data, total_score: String(total), approved: '0' });
    }
  }

  async getResults(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    const cls = q.class || user.class;

    if (q.student_id) {
      const results = await this.resultsWithTotals({ student_id: q.student_id, session, term });
      return this.ok({ results });
    }

    const students = await this.prisma.findMany<any>('users', { where: { class: cls }, select: { student_id: true, firstname: true, lastname: true } });
    const byId = new Map(students.map(s => [s.student_id, s]));
    const results = (await this.resultsWithTotals({
      session,
      term,
      student_id: { in: students.map(s => s.student_id) },
      ...(q.course ? { course: q.course } : {}),
    })).map(r => ({ ...r, firstname: byId.get(r.student_id)?.firstname, lastname: byId.get(r.student_id)?.lastname }));
    return this.ok(results);
  }

  async deleteResult(body: any) {
    const { class: cls, course, session, term, student_ids } = body;
    if (!Array.isArray(student_ids)) throw new BadRequestException('student_ids must be an array');
    let count = 0;
    for (const id of student_ids) {
      const affected = await this.prisma.deleteMany('result', { student_id: id, course, session, term });
      if (affected) count++;
    }
    return this.ok({ count }, `Successfully deleted ${count} result(s)`);
  }

  async getAttendance(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    if (q.student_id) {
      const att = await this.prisma.findFirst('attendance', { where: { student_id: q.student_id, session, term } });
      return this.ok(att);
    }
    if (q.class) {
      const students = await this.prisma.findMany<any>('users', { where: { class: q.class }, select: { student_id: true } });
      const records = await this.prisma.findMany('attendance', { where: { student_id: { in: students.map(s => s.student_id) }, session, term } });
      return this.ok(records);
    }
    throw new BadRequestException('student_id or class is required');
  }

  async updateAttendance(body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();

    if (Array.isArray(body.students)) {
      let count = 0;
      for (const s of body.students) {
        if (!s.student_id) continue;
        await this.upsertAttendance(s.student_id, s.present || 0, s.absent || 0, session, term);
        count++;
      }
      return this.ok({ count }, `Saved attendance for ${count} student(s)`);
    }

    await this.upsertAttendance(body.student_id, body.present, body.absent, session, term);
    return this.ok(null, 'Attendance updated successfully');
  }

  private async upsertAttendance(studentId: string, present: number, absent: number, session: string, term: string) {
    const existing = await this.prisma.findFirst('attendance', { where: { student_id: studentId, session, term }, select: { attendance_id: true } });
    if (existing) {
      await this.prisma.updateMany('attendance', { student_id: studentId, session, term }, { present: String(present), absent: String(absent) });
    } else {
      await this.prisma.create('attendance', { student_id: studentId, present: String(present), absent: String(absent), session, term });
    }
  }

  async addComment(body: any) {
    const { student_id, comment, session, term } = body;
    if (!student_id || !comment || !session || !term) throw new BadRequestException('All fields required');
    const existing = await this.prisma.findFirst('attendance', { where: { student_id, session, term }, select: { attendance_id: true } });
    if (existing) {
      await this.prisma.updateMany('attendance', { student_id, session, term }, { comment });
    } else {
      await this.prisma.create('attendance', { student_id, comment, session, term, present: '0', absent: '0' });
    }
    return this.ok(null, 'Comment added successfully');
  }

  async createAssignment(user: any, body: any, file?: Express.Multer.File) {
    const data: any = { subject: body.subject, class: body.class, assignment: body.assignment, deadline: body.deadline, staff_id: user.unique_id, date: new Date() };
    if (file) data.file = file.filename;
    const id = await this.prisma.create('assignment', data);
    return this.ok({ id }, 'Assignment created successfully');
  }

  async getAssignments(user: any) {
    const assignments = await this.prisma.findMany('assignment', { where: { staff_id: user.unique_id }, orderBy: { assignment_id: 'desc' } });
    return this.ok(assignments);
  }

  async updateAssignment(user: any, id: number, body: any, file?: Express.Multer.File) {
    const assignment = await this.prisma.findFirst<any>('assignment', { where: { assignment_id: id } });
    if (!assignment || assignment.staff_id !== user.unique_id) throw new NotFoundException('Assignment not found');
    const data: any = {};
    ['subject', 'class', 'assignment', 'deadline'].forEach(k => { if (body[k]) data[k] = body[k]; });
    if (file) data.file = file.filename;
    await this.prisma.updateMany('assignment', { assignment_id: id }, data);
    return this.ok(null, 'Assignment updated successfully');
  }

  async deleteAssignment(user: any, id: number) {
    const assignment = await this.prisma.findFirst<any>('assignment', { where: { assignment_id: id } });
    if (!assignment || assignment.staff_id !== user.unique_id) throw new NotFoundException('Assignment not found');
    await this.prisma.deleteMany('assignment', { assignment_id: id });
    return this.ok(null, 'Assignment deleted successfully');
  }

  async getLibrary(user: any) {
    const items = await this.prisma.findMany('library', { where: { staff_id: user.unique_id }, orderBy: { library_id: 'desc' } });
    return this.ok(items);
  }

  async uploadLibrary(user: any, body: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const id = await this.prisma.create('library', { course: body.course, class: body.class, about: body.about, staff_id: user.unique_id, pdf: file.filename, verify: '0', date: String(new Date()) });
    return this.ok({ id }, 'Document uploaded successfully');
  }

  async deleteLibrary(user: any, id: number) {
    const item = await this.prisma.findFirst<any>('library', { where: { library_id: id } });
    if (!item) throw new NotFoundException('Document not found');
    if (item.staff_id !== user.unique_id) throw new ForbiddenException('You can only delete your own documents');
    await this.prisma.deleteMany('library', { library_id: id });
    return this.ok(null, 'Document deleted successfully');
  }

  async getClasses() {
    return { success: true, data: await this.prisma.findMany('class', { orderBy: { class_id: 'asc' } }) };
  }

  async getCourses() {
    const courses = await this.prisma.findMany<any>('course', { orderBy: { courses: 'asc' } });
    return { success: true, data: courses.map(c => ({ course_id: c.course_id, course: c.courses, teacher: c.teacher })) };
  }

  async getSchoolDays() {
    return { success: true, data: await this.prisma.findMany('school_days', { orderBy: [{ session: 'desc' }, { term: 'asc' }] }) };
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.findMany<any>('result', { where });
    return rows.map(row => ({
      ...row,
      total_score: (parseFloat(row.test_score) || 0) + (parseFloat(row.exam_score) || 0),
    }));
  }
}
