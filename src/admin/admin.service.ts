import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(private db: DatabaseService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async dashboard() {
    const [students, staff, session, term, recentStudents, recentPayments] = await Promise.all([
      this.db.queryOne<any>('SELECT COUNT(*) as total, SUM(admin_verify=1) as verified, SUM(admin_verify=0) as pending FROM users'),
      this.db.queryOne<any>('SELECT COUNT(*) as total, SUM(admin_verify=1) as verified FROM staff'),
      this.db.queryOne<any>('SELECT set_session FROM set_session_tbl LIMIT 1'),
      this.db.queryOne<any>('SELECT set_term FROM set_term_tbl LIMIT 1'),
      this.db.query('SELECT firstname, lastname, date FROM users ORDER BY user_id DESC LIMIT 3'),
      this.db.query('SELECT student_id, date FROM scratch_card ORDER BY id DESC LIMIT 3'),
    ]);
    const studentsByClass = await this.db.query('SELECT class, COUNT(*) as count FROM users GROUP BY class');
    return this.ok({ students, staff, studentsByClass, current_session: session?.set_session, current_term: term?.set_term, recentStudents, recentPayments });
  }

  async getStudents(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const offset = (page - 1) * perPage;
    const params: any[] = [];
    let where = '1=1';

    if (q.class) { where += ' AND class = ?'; params.push(q.class); }
    if (q.status === '1' || q.status === '0') { where += ' AND admin_verify = ?'; params.push(q.status); }
    if (q.search) {
      const like = `%${q.search}%`;
      where += ' AND (firstname LIKE ? OR lastname LIKE ? OR student_id LIKE ? OR email LIKE ?)';
      params.push(like, like, like, like);
    }

    const total = await this.db.count('users', where, params);
    const students = await this.db.query(
      `SELECT student_id, firstname, lastname, email, class, image, admin_verify FROM users WHERE ${where} ORDER BY user_id DESC LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );
    return { success: true, data: students, meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage) } };
  }

  async createStudent(data: any) {
    const studentId = await this.generateStudentId();
    await this.db.insert('users', {
      student_id: studentId,
      firstname: data.firstname || '',
      lastname: data.lastname || '',
      email: data.email || '',
      telephone: data.telephone || '',
      class: data.class || '',
      gender: data.gender || '',
      image: 'image.png',
      password: await bcrypt.hash(data.password || 'greatkings', 10),
      admin_verify: '1',
    });
    return this.ok({ student_id: studentId }, 'Student created successfully');
  }

  async updateStudent(studentId: string, data: any) {
    const student = await this.db.queryOne('SELECT * FROM users WHERE student_id = ?', [studentId]);
    if (!student) throw new NotFoundException('Student not found');
    const allowed = ['firstname', 'lastname', 'email', 'telephone', 'class', 'gender', 'date_of_birth', 'state_of_origin', 'home_address', 'father_name', 'mother_name'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    if (Object.keys(update).length) await this.db.update('users', update, 'student_id = ?', [studentId]);
    return this.ok(null, 'Student updated successfully');
  }

  async verifyStudent(studentId: string) {
    await this.db.update('users', { admin_verify: '1' }, 'student_id = ?', [studentId]);
    await this.db.insert('notification', { user_id: studentId, user_type: 'student', title: 'Account Verified', message: 'Your account has been verified. You can now access all features.', type: 'success', is_read: 0, created_at: new Date() });
    return this.ok(null, 'Student verified successfully');
  }

  async bulkVerifyStudents(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No students selected');
    for (const id of ids) await this.verifyStudent(id);
    return this.ok({ count: ids.length }, `${ids.length} student(s) verified successfully`);
  }

  async deleteStudent(studentId: string) {
    const student = await this.db.queryOne<any>('SELECT user_id FROM users WHERE student_id = ?', [studentId]);
    if (!student) throw new NotFoundException('Student not found');
    await this.db.delete('users', 'user_id = ?', [student.user_id]);
    return this.ok(null, 'Student deleted successfully');
  }

  async getStaff(q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const offset = (page - 1) * perPage;
    const total = await this.db.count('staff');
    const staff = await this.db.query('SELECT * FROM staff ORDER BY id DESC LIMIT ? OFFSET ?', [perPage, offset]);
    return { success: true, data: staff, meta: { total, page, per_page: perPage } };
  }

  async createStaff(data: any) {
    const uniqueId = await this.generateStaffId();
    await this.db.insert('staff', {
      unique_id: uniqueId,
      firstname: data.firstname || '',
      lastname: data.lastname || '',
      email: data.email || '',
      telephone: data.telephone || '',
      class: data.class || '',
      course: data.course || '',
      password: await bcrypt.hash(data.password || 'greatkings', 10),
      image: 'image.png',
      admin_verify: '1',
    });
    return this.ok({ unique_id: uniqueId }, 'Staff created successfully');
  }

  async updateStaff(staffId: string, data: any) {
    const allowed = ['firstname', 'lastname', 'email', 'telephone', 'class', 'course'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    if (Object.keys(update).length) await this.db.update('staff', update, 'unique_id = ?', [staffId]);
    return this.ok(null, 'Staff updated successfully');
  }

  async verifyStaff(staffId: string) {
    await this.db.update('staff', { admin_verify: '1' }, 'unique_id = ?', [staffId]);
    return this.ok(null, 'Staff verified successfully');
  }

  async deleteStaff(staffId: string) {
    await this.db.delete('staff', 'unique_id = ?', [staffId]);
    return this.ok(null, 'Staff deleted successfully');
  }

  async getSessions() {
    const sessions = await this.db.query('SELECT * FROM session ORDER BY session DESC');
    const current = await this.db.queryOne<any>('SELECT set_session FROM set_session_tbl LIMIT 1');
    return this.ok(sessions.map((s: any) => ({ ...s, current: s.session === current?.set_session })));
  }

  async createSession(session: string) {
    if (!session) throw new BadRequestException('Session is required');
    await this.db.insert('session', { session });
    return this.ok(null, 'Session created successfully');
  }

  async setCurrentSession(session: string) {
    await this.db.update('set_session_tbl', { set_session: session }, '1=1');
    return this.ok(null, 'Current session updated successfully');
  }

  async deleteSession(session: string) {
    await this.db.delete('session', 'session = ?', [session]);
    return this.ok(null, 'Session deleted successfully');
  }

  async getTerms() {
    const terms = await this.db.query('SELECT * FROM term ORDER BY term_id');
    const current = await this.db.queryOne<any>('SELECT set_term FROM set_term_tbl LIMIT 1');
    return this.ok(terms.map((t: any) => ({ ...t, current: t.term === current?.set_term })));
  }

  async setCurrentTerm(term: string) {
    await this.db.update('set_term_tbl', { set_term: term }, '1=1');
    return this.ok(null, 'Current term updated successfully');
  }

  async getPendingPayments() {
    const payments = await this.db.query("SELECT * FROM scratch_card WHERE verified = 'no' ORDER BY id DESC");
    return this.ok(payments);
  }

  async verifyPayment(id: number) {
    await this.db.update('scratch_card', { verified: 'yes', admin_date: new Date() }, 'id = ?', [id]);
    return this.ok(null, 'Payment verified successfully');
  }

  async getLibrary() {
    const library = await this.db.query('SELECT l.*, s.firstname, s.lastname FROM library l LEFT JOIN staff s ON l.staff_id = s.unique_id ORDER BY l.verify ASC, l.date DESC');
    return this.ok(library);
  }

  async approveLibrary(id: number) {
    await this.db.update('library', { verify: '1' }, 'library_id = ?', [id]);
    return this.ok(null, 'Book approved successfully');
  }

  async deleteLibrary(id: number) {
    await this.db.delete('library', 'library_id = ?', [id]);
    return this.ok(null, 'Book deleted successfully');
  }

  async getClasses() {
    return this.ok(await this.db.query('SELECT c.*, CONCAT(s.firstname, " ", s.lastname) as teacher_name, (SELECT COUNT(*) FROM users WHERE class = c.class) as student_count FROM class c LEFT JOIN staff s ON c.class_teacher = s.unique_id ORDER BY c.class_id'));
  }

  async createClass(data: any) {
    await this.db.insert('class', { class: data.class, class_teacher: data.class_teacher || '' });
    return this.ok(null, 'Class created successfully');
  }

  async updateClass(oldName: string, data: any) {
    await this.db.update('class', { class: data.class, class_teacher: data.class_teacher || '' }, 'class = ?', [oldName]);
    return this.ok(null, 'Class updated successfully');
  }

  async deleteClass(name: string) {
    await this.db.delete('class', 'class = ?', [name]);
    return this.ok(null, 'Class deleted successfully');
  }

  async getCourses() {
    return this.ok(await this.db.query('SELECT course_id, courses as course, teacher FROM course ORDER BY courses ASC'));
  }

  async createCourse(data: any) {
    await this.db.insert('course', { courses: data.course, teacher: data.teacher || '' });
    return this.ok(null, 'Course created successfully');
  }

  async updateCourse(oldName: string, data: any) {
    await this.db.update('course', { courses: data.course, teacher: data.teacher || '' }, 'courses = ?', [oldName]);
    return this.ok(null, 'Course updated successfully');
  }

  async deleteCourse(name: string) {
    await this.db.delete('course', 'courses = ?', [name]);
    return this.ok(null, 'Course deleted successfully');
  }

  async getResults(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    let sql = `SELECT DISTINCT r.student_id, u.firstname, u.lastname, u.class, u.image,
      (SELECT COUNT(*) FROM result WHERE student_id = r.student_id AND session = ? AND term = ?) as subject_count,
      (SELECT ROUND(AVG(total_score),1) FROM result WHERE student_id = r.student_id AND session = ? AND term = ?) as average,
      (SELECT approved FROM result WHERE student_id = r.student_id AND session = ? AND term = ? LIMIT 1) as approved
      FROM result r LEFT JOIN users u ON r.student_id = u.student_id
      WHERE r.session = ? AND r.term = ?`;
    const params: any[] = [session, term, session, term, session, term, session, term];
    if (q.class) { sql += ' AND u.class = ?'; params.push(q.class); }
    sql += ' ORDER BY u.class, u.firstname';
    const students = await this.db.query(sql, params);
    const classes = await this.db.query('SELECT * FROM class ORDER BY class_id');
    const sessions = await this.db.query('SELECT session FROM session ORDER BY session DESC');
    return this.ok({ students, classes, sessions, current_session: session, current_term: term });
  }

  async getStudentResults(studentId: string, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    const student = await this.db.queryOne('SELECT * FROM users WHERE student_id = ?', [studentId]);
    if (!student) throw new NotFoundException('Student not found');
    const results = await this.db.query(
      'SELECT *, (test_score + exam_score) as total_score FROM result WHERE student_id = ? AND session = ? AND term = ?',
      [studentId, session, term],
    );
    const attendance = await this.db.queryOne('SELECT * FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    return this.ok({ student, results, attendance, session, term });
  }

  async approveResults(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    await this.db.update('result', { approved: 1 }, 'student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    await this.db.insert('notification', { user_id: studentId, user_type: 'student', title: 'Results Approved', message: `Your result for ${term} term, ${session} session has been approved.`, type: 'info', is_read: 0, created_at: new Date() });
    return this.ok(null, 'Results approved successfully');
  }

  async unapproveResults(studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    await this.db.update('result', { approved: 0 }, 'student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    await this.db.insert('notification', { user_id: studentId, user_type: 'student', title: 'Results Unapproved', message: `Your result for ${term} term, ${session} session has been unapproved.`, type: 'info', is_read: 0, created_at: new Date() });
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
    const existing = await this.db.queryOne('SELECT id FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    if (existing) {
      await this.db.update('attendance', { principal_comment: comment }, 'student_id = ? AND session = ? AND term = ?', [studentId, session, term]);
    } else {
      await this.db.insert('attendance', { student_id: studentId, session, term, principal_comment: comment, present: 0, absent: 0 });
    }
    return this.ok({ student_id: studentId, session, term, principal_comment: comment }, 'Comment updated successfully');
  }

  async getSchoolDays() {
    return this.ok(await this.db.query('SELECT * FROM school_days ORDER BY session DESC, term ASC'));
  }

  async setSchoolDays(body: any) {
    const { session, term, total_days } = body;
    if (!session || !term || !total_days) throw new BadRequestException('Session, term, and total_days are required');
    const existing = await this.db.queryOne('SELECT id FROM school_days WHERE session = ? AND term = ?', [session, term]);
    if (existing) {
      await this.db.update('school_days', { total_days }, 'session = ? AND term = ?', [session, term]);
    } else {
      await this.db.insert('school_days', { session, term, total_days });
    }
    return this.ok(null, 'School days set successfully');
  }

  async deleteSchoolDays(session: string, term: string) {
    await this.db.delete('school_days', 'session = ? AND term = ?', [session, term]);
    return this.ok(null, 'School days deleted successfully');
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.db.queryOne<any>('SELECT set_session FROM set_session_tbl LIMIT 1');
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.db.queryOne<any>('SELECT set_term FROM set_term_tbl LIMIT 1');
    return r?.set_term || '';
  }

  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.db.queryOne<any>('SELECT student_id FROM users ORDER BY user_id DESC LIMIT 1');
    const num = last ? parseInt(last.student_id.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `GKA${year}${String(num).padStart(4, '0')}`;
  }

  private async generateStaffId(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.db.queryOne<any>('SELECT unique_id FROM staff ORDER BY id DESC LIMIT 1');
    const num = last ? parseInt(last.unique_id.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `GKS${year}${String(num).padStart(4, '0')}`;
  }
}
