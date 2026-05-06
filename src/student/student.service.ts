import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class StudentService {
  constructor(private db: DatabaseService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.db.queryOne<any>('SELECT set_session FROM set_session_tbl LIMIT 1');
    return r?.set_session || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.db.queryOne<any>('SELECT set_term FROM set_term_tbl LIMIT 1');
    return r?.set_term || '';
  }

  async dashboard(user: any) {
    const [session, term, unread, assignments] = await Promise.all([
      this.getCurrentSession(),
      this.getCurrentTerm(),
      this.db.count('notifications', 'user_id = ? AND is_read = 0', [user.student_id]),
      this.db.query('SELECT a.*, s.firstname, s.lastname FROM assignment a LEFT JOIN staff s ON a.staff_id = s.unique_id WHERE a.class = ? ORDER BY a.date DESC LIMIT 5', [user.class]),
    ]);
    return this.ok({ user, current_session: session, current_term: term, unread_notifications: unread, recent_assignments: assignments });
  }

  async profile(user: any) {
    const profile = await this.db.queryOne('SELECT * FROM users WHERE student_id = ?', [user.student_id]);
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstname', 'lastname', 'email', 'telephone', 'date_of_birth', 'state_of_origin', 'home_address', 'father_name', 'mother_name', 'gender'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    if (Object.keys(update).length) await this.db.update('users', update, 'student_id = ?', [user.student_id]);
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    await this.db.update('users', { image: file.filename }, 'student_id = ?', [user.student_id]);
    return this.ok({ image: file.filename }, 'Image updated successfully');
  }

  async getResults(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();

    if (!session || !term) {
      throw new BadRequestException('No active session or term found. Please contact admin.');
    }

    // Check if any result exists for this student, session and term
    const resultExists = await this.db.queryOne<any>(
      'SELECT result_id, approved FROM result WHERE student_id = ? AND session = ? AND term = ? LIMIT 1',
      [user.student_id, session, term],
    );

    if (!resultExists) {
      throw new NotFoundException(`No results found for ${term} term, ${session} session.`);
    }

    if (!resultExists.approved || resultExists.approved == '0') {
      throw new NotFoundException(`Results for ${term} term, ${session} session have not been approved yet. Please check back later.`);
    }

    const [results, attendance, teacher, principal] = await Promise.all([
      this.db.query('SELECT *, (test_score + exam_score) as total_score FROM result WHERE student_id = ? AND session = ? AND term = ?', [user.student_id, session, term]),
      this.db.queryOne('SELECT * FROM attendance WHERE student_id = ? AND session = ? AND term = ?', [user.student_id, session, term]),
      this.db.queryOne<any>('SELECT firstname, lastname, image FROM staff WHERE class = ? LIMIT 1', [user.class]),
      this.db.queryOne<any>("SELECT firstname, lastname, image FROM staff WHERE user = 'admin' LIMIT 1"),
    ]);

    const classSize = await this.db.count(
      'result',
      'session = ? AND term = ? AND approved = 1 AND student_id IN (SELECT student_id FROM users WHERE class = ?)',
      [session, term, user.class],
    );

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

  async getAssignments(user: any) {
    return this.ok(await this.db.query('SELECT a.*, s.firstname, s.lastname FROM assignment a LEFT JOIN staff s ON a.staff_id = s.unique_id WHERE a.class = ? ORDER BY a.date DESC', [user.class]));
  }

  async getLibrary(user: any) {
    return this.ok(await this.db.query("SELECT l.*, s.firstname, s.lastname FROM library l LEFT JOIN staff s ON l.staff_id = s.unique_id WHERE l.class = ? AND l.verify = '1' ORDER BY l.date DESC", [user.class]));
  }

  async getClassTimetable(user: any) {
    return this.ok(await this.db.query('SELECT * FROM class_timetable WHERE class = ?', [user.class]));
  }

  async getExamTimetable(user: any) {
    const juniorClasses = ['JSS1', 'JSS2', 'JSS3'];
    const level = juniorClasses.includes(user.class?.toUpperCase()) ? 'junior' : 'senior';
    return this.ok(await this.db.query('SELECT * FROM exam_timetable WHERE level = ?', [level]));
  }

  async getNotifications(user: any) {
    return this.ok(await this.db.query('SELECT * FROM notification WHERE user_id = ? AND user_type = ? ORDER BY id DESC', [user.student_id, 'student']));
  }

  async markNotificationsRead(user: any) {
    await this.db.update('notification', { is_read: 1 }, 'user_id = ? AND user_type = ? AND is_read = 0', [user.student_id, 'student']);
    return this.ok(null, 'Notifications marked as read');
  }

  async getPayments(user: any) {
    return this.ok(await this.db.query('SELECT * FROM scratch_card WHERE student_id = ? ORDER BY id DESC', [user.student_id]));
  }

  async initializePayment(user: any, body: any) {
    const amount = body.type === 'scratch_card' ? 500 : (body.amount || 0);
    return this.ok({ message: 'Please submit your payment receipt', amount, type: body.type || 'scratch_card' });
  }

  async getScratchCards(user: any) {
    return this.ok(await this.db.query('SELECT * FROM scratch_card WHERE student_id = ? ORDER BY id DESC', [user.student_id]));
  }

  async submitPayment(user: any, body: any) {
    const { session, term, amount = '500', transfer_date } = body;
    if (!session || !term) throw new BadRequestException('Session and term are required');
    const existing = await this.db.queryOne('SELECT id FROM scratch_card WHERE student_id = ? AND session = ? AND term = ?', [user.student_id, session, term]);
    if (existing) throw new BadRequestException('You have already paid for this session/term');
    const id = await this.db.insert('scratch_card', { student_id: user.student_id, transfer_amount: amount, transfer_date: transfer_date || new Date().toISOString().split('T')[0], upload: '', term, session, verified: 'no', date: new Date(), admin_date: '' });
    return this.ok({ id }, 'Payment submitted. Awaiting admin verification.');
  }
}
