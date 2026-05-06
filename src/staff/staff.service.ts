import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class StaffService {
  constructor(private db: DatabaseService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.db.queryOne<any>('SELECT set_session FROM session WHERE current_session = 1 LIMIT 1');
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.db.queryOne<any>('SELECT term FROM term WHERE current_term = 1 LIMIT 1');
    return r?.term || '';
  }

  async dashboard(user: any) {
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();
    const studentCount = await this.db.count('users', 'class = ?', [user.class]);
    const assignments = await this.db.query('SELECT * FROM assignments WHERE staff_id = ? ORDER BY id DESC', [user.unique_id]);
    const libraryItems = await this.db.query('SELECT * FROM library WHERE staff_id = ? ORDER BY id DESC', [user.unique_id]);
    return this.ok({ user, current_session: session, current_term: term, student_count: studentCount, analytics: { assignments: { total: assignments.length, recent: assignments.slice(0, 5) }, library: { total: libraryItems.length, verified: libraryItems.filter((i: any) => i.verify == '1').length, pending: libraryItems.filter((i: any) => i.verify != '1').length } } });
  }

  async profile(user: any) {
    const profile = await this.db.queryOne('SELECT * FROM staff WHERE unique_id = ?', [user.unique_id]);
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstname', 'lastname', 'email', 'telephone', 'date_of_birth', 'state_of_origin', 'home_address'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    if (Object.keys(update).length) await this.db.update('staff', update, 'unique_id = ?', [user.unique_id]);
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    await this.db.update('staff', { image: file.filename }, 'unique_id = ?', [user.unique_id]);
    return this.ok({ image: file.filename }, 'Image updated successfully');
  }

  async getStudents(user: any, cls?: string) {
    const targetClass = cls || user.class;
    const students = await this.db.query('SELECT * FROM users WHERE class = ? AND admin_verify = 1', [targetClass]);
    return this.ok(students);
  }

  async getStudentDetails(id: string) {
    const student = await this.db.queryOne('SELECT * FROM users WHERE student_id = ?', [id]);
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
    const existing = await this.db.queryOne('SELECT id FROM result WHERE student_id = ? AND course = ? AND session = ? AND term = ?', [data.student_id, data.course, data.session, data.term]);
    if (existing) {
      await this.db.update('result', { test_score: data.test_score, exam_score: data.exam_score, total_score: total, teacher_id: data.teacher_id }, 'student_id = ? AND course = ? AND session = ? AND term = ?', [data.student_id, data.course, data.session, data.term]);
    } else {
      await this.db.insert('result', { ...data, total_score: total, approved: 0 });
    }
  }

  async getResults(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    const cls = q.class || user.class;

    if (q.student_id) {
      const results = await this.db.query('SELECT *, (test_score + exam_score) as total_score FROM result WHERE student_id = ? AND session = ? AND term = ?', [q.student_id, session, term]);
      return this.ok({ results });
    }

    const results = await this.db.query(
      'SELECT r.*, u.firstname, u.lastname FROM result r LEFT JOIN users u ON r.student_id = u.student_id WHERE r.session = ? AND r.term = ? AND u.class = ?' + (q.course ? ' AND r.course = ?' : ''),
      q.course ? [session, term, cls, q.course] : [session, term, cls],
    );
    return this.ok(results);
  }

  async deleteResult(body: any) {
    const { class: cls, course, session, term, student_ids } = body;
    if (!Array.isArray(student_ids)) throw new BadRequestException('student_ids must be an array');
    let count = 0;
    for (const id of student_ids) {
      const affected = await this.db.delete('result', 'student_id = ? AND course = ? AND session = ? AND term = ?', [id, course, session, term]);
      if (affected) count++;
    }
    return this.ok({ count }, `Successfully deleted ${count} result(s)`);
  }

  async getAttendance(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    if (q.student_id) {
      const att = await this.db.queryOne('SELECT * FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [q.student_id, session, term]);
      return this.ok(att);
    }
    if (q.class) {
      const students = await this.db.query('SELECT student_id FROM users WHERE class = ?', [q.class]);
      const records = [];
      for (const s of students) {
        const att = await this.db.queryOne('SELECT * FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [(s as any).student_id, session, term]);
        if (att) records.push(att);
      }
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
    const existing = await this.db.queryOne('SELECT id FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    if (existing) {
      await this.db.update('attendance', { present, absent }, 'student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    } else {
      await this.db.insert('attendance', { student_id: studentId, present, absent, session, term });
    }
  }

  async addComment(body: any) {
    const { student_id, comment, session, term } = body;
    if (!student_id || !comment || !session || !term) throw new BadRequestException('All fields required');
    const existing = await this.db.queryOne('SELECT id FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [student_id, session, term]);
    if (existing) {
      await this.db.update('attendance', { comment }, 'student_id = ? AND session = ? AND term = ?', [student_id, session, term]);
    } else {
      await this.db.insert('attendance', { student_id, comment, session, term, present: 0, absent: 0 });
    }
    return this.ok(null, 'Comment added successfully');
  }

  async createAssignment(user: any, body: any, file?: Express.Multer.File) {
    const data: any = { subject: body.subject, class: body.class, assignment: body.assignment, deadline: body.deadline, staff_id: user.unique_id, date: new Date() };
    if (file) data.file = file.filename;
    const id = await this.db.insert('assignments', data);
    return this.ok({ id }, 'Assignment created successfully');
  }

  async getAssignments(user: any) {
    const assignments = await this.db.query('SELECT * FROM assignments WHERE staff_id = ? ORDER BY id DESC', [user.unique_id]);
    return this.ok(assignments);
  }

  async updateAssignment(user: any, id: number, body: any, file?: Express.Multer.File) {
    const assignment = await this.db.queryOne<any>('SELECT * FROM assignments WHERE id = ?', [id]);
    if (!assignment || assignment.staff_id !== user.unique_id) throw new NotFoundException('Assignment not found');
    const data: any = {};
    ['subject', 'class', 'assignment', 'deadline'].forEach(k => { if (body[k]) data[k] = body[k]; });
    if (file) data.file = file.filename;
    await this.db.update('assignments', data, 'id = ?', [id]);
    return this.ok(null, 'Assignment updated successfully');
  }

  async deleteAssignment(user: any, id: number) {
    const assignment = await this.db.queryOne<any>('SELECT * FROM assignments WHERE id = ?', [id]);
    if (!assignment || assignment.staff_id !== user.unique_id) throw new NotFoundException('Assignment not found');
    await this.db.delete('assignments', 'id = ?', [id]);
    return this.ok(null, 'Assignment deleted successfully');
  }

  async getLibrary(user: any) {
    const items = await this.db.query('SELECT * FROM library WHERE staff_id = ? ORDER BY id DESC', [user.unique_id]);
    return this.ok(items);
  }

  async uploadLibrary(user: any, body: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const id = await this.db.insert('library', { course: body.course, class: body.class, about: body.about, staff_id: user.unique_id, pdf: file.filename, verify: '0', date: new Date() });
    return this.ok({ id }, 'Document uploaded successfully');
  }

  async deleteLibrary(user: any, id: number) {
    const item = await this.db.queryOne<any>('SELECT * FROM library WHERE id = ?', [id]);
    if (!item) throw new NotFoundException('Document not found');
    if (item.staff_id !== user.unique_id) throw new ForbiddenException('You can only delete your own documents');
    await this.db.delete('library', 'id = ?', [id]);
    return this.ok(null, 'Document deleted successfully');
  }

  async getClasses() {
    return { success: true, data: await this.db.query('SELECT * FROM classes ORDER BY id ASC') };
  }

  async getCourses() {
    return { success: true, data: await this.db.query('SELECT * FROM courses ORDER BY id ASC') };
  }

  async getSchoolDays() {
    return { success: true, data: await this.db.query('SELECT * FROM school_days ORDER BY id DESC') };
  }
}
