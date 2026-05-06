import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CbtService {
  constructor(private db: DatabaseService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async getAvailableTests(user: any) {
    const tests = await this.db.query('SELECT course, COUNT(*) as question_count, MAX(duration) as duration FROM cbt WHERE class = ? GROUP BY course ORDER BY course', [user.class]);
    for (const test of tests as any[]) {
      const completed = await this.db.queryOne('SELECT id FROM cbt_result WHERE student_id = ? AND class = ? AND course = ?', [user.student_id, user.class, test.course]);
      test.completed = !!completed;
      if (!completed) {
        const session = await this.db.queryOne<any>('SELECT start_time, duration FROM cbt_session WHERE student_id = ? AND course = ? ORDER BY id DESC LIMIT 1', [user.student_id, test.course]);
        if (session) {
          const elapsed = Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000);
          test.remaining_time = Math.max(0, session.duration * 60 - elapsed);
          test.in_progress = test.remaining_time > 0;
        }
      }
    }
    return this.ok(tests);
  }

  async startTest(user: any, course: string) {
    const completed = await this.db.queryOne('SELECT id FROM cbt_result WHERE student_id = ? AND class = ? AND course = ?', [user.student_id, user.class, course]);
    if (completed) throw new ForbiddenException('You have already completed this test');

    const testInfo = await this.db.queryOne<any>('SELECT duration FROM cbt WHERE class = ? AND course = ? LIMIT 1', [user.class, course]);
    const duration = testInfo?.duration || 30;

    const existingSession = await this.db.queryOne<any>('SELECT * FROM cbt_session WHERE student_id = ? AND course = ? ORDER BY id DESC LIMIT 1', [user.student_id, course]);
    let remainingTime = duration * 60;

    if (existingSession) {
      const elapsed = Math.floor((Date.now() - new Date(existingSession.start_time).getTime()) / 1000);
      remainingTime = Math.max(0, existingSession.duration * 60 - elapsed);
      if (remainingTime <= 0) throw new ForbiddenException('Test time has expired');
    } else {
      await this.db.insert('cbt_session', { student_id: user.student_id, class: user.class, course, duration, start_time: new Date() });
    }

    const questions = await this.db.query('SELECT cbt_id, question, option1, option2, option3, option4 FROM cbt WHERE class = ? AND course = ? ORDER BY RAND()', [user.class, course]);
    if (!questions.length) throw new NotFoundException('No questions found for this test');

    return this.ok({ course, questions, total_questions: questions.length, duration, remaining_time: remainingTime });
  }

  async submitAnswer(user: any, body: any) {
    const { cbt_id, answer, course } = body;
    if (!cbt_id || !answer || !course) throw new BadRequestException('cbt_id, answer, and course are required');
    const existing = await this.db.queryOne('SELECT id FROM student_answers WHERE cbt_id = ? AND student_id = ?', [cbt_id, user.student_id]);
    if (existing) {
      await this.db.update('student_answers', { student_pick: answer }, 'cbt_id = ? AND student_id = ?', [cbt_id, user.student_id]);
    } else {
      await this.db.insert('student_answers', { cbt_id, student_pick: answer, class: user.class, course, student_id: user.student_id });
    }
    return this.ok(null, 'Answer submitted');
  }

  async submitTest(user: any, course: string) {
    const answers = await this.db.query('SELECT sa.student_pick, c.answer FROM student_answers sa JOIN cbt c ON sa.cbt_id = c.cbt_id WHERE sa.student_id = ? AND sa.course = ?', [user.student_id, course]);
    const score = (answers as any[]).filter(a => a.student_pick === a.answer).length;
    const existing = await this.db.queryOne('SELECT id FROM cbt_result WHERE student_id = ? AND class = ? AND course = ?', [user.student_id, user.class, course]);
    if (!existing) await this.db.insert('cbt_result', { student_id: user.student_id, class: user.class, course, score, date: new Date() });
    return this.ok({ score }, 'Test submitted successfully');
  }

  async getStudentResults(user: any) {
    return this.ok(await this.db.query('SELECT * FROM cbt_result WHERE student_id = ? ORDER BY id DESC', [user.student_id]));
  }

  async getStaffExams(user: any) {
    const staffId = user.unique_id ?? user.student_id;
    return this.ok(await this.db.query('SELECT DISTINCT class, course, duration FROM cbt WHERE staff_id = ?', [staffId]));
  }

  async createQuestion(user: any, body: any) {
    const staffId = user.unique_id ?? user.student_id;
    const id = await this.db.insert('cbt', { ...body, staff_id: staffId, duration: body.duration || 30 });
    return this.ok({ id }, 'Question created successfully');
  }

  async getQuestions(cls: string, course: string) {
    if (!cls || !course) throw new BadRequestException('Class and course are required');
    return this.ok(await this.db.query('SELECT * FROM cbt WHERE class = ? AND course = ?', [cls, course]));
  }

  async deleteQuestion(id: number) {
    await this.db.delete('cbt', 'cbt_id = ?', [id]);
    return this.ok(null, 'Question deleted successfully');
  }

  async getExamResults(cls: string, course: string) {
    if (!cls || !course) throw new BadRequestException('Class and course are required');
    return this.ok(await this.db.query('SELECT cr.*, u.firstname, u.lastname FROM cbt_result cr LEFT JOIN users u ON cr.student_id = u.student_id WHERE cr.class = ? AND cr.course = ?', [cls, course]));
  }

  async extractQuestions(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const content = fs.readFileSync(file.path, 'utf8');
    const questions = this.parseQuestions(content);
    fs.unlinkSync(file.path);
    if (!questions.length) throw new BadRequestException('No questions could be identified in the file');
    return this.ok(questions);
  }

  async bulkCreate(user: any, body: any) {
    const { data, class: cls, course, duration = 30 } = body;
    if (!data || !cls || !course) throw new BadRequestException('Missing required data');
    const staffId = user.unique_id ?? user.student_id;
    let count = 0;
    for (const item of data) {
      if (!item.question || !item.answer) continue;
      await this.db.insert('cbt', { class: cls, course, staff_id: staffId, question: item.question, option1: item.option1 || '', option2: item.option2 || '', option3: item.option3 || '', option4: item.option4 || '', answer: item.answer, duration: +duration });
      count++;
    }
    return this.ok(null, `Successfully imported ${count} questions`);
  }

  private parseQuestions(text: string): any[] {
    const questions: any[] = [];
    const parts = text.split(/\n\d+[\.\)]\s+/).filter(Boolean);
    for (const part of parts) {
      const optionParts = part.split(/\s+[A-D][\.\)]\s+/);
      if (optionParts.length >= 3) {
        questions.push({ question: optionParts[0].trim(), option1: optionParts[1]?.trim() || '', option2: optionParts[2]?.trim() || '', option3: optionParts[3]?.trim() || '', option4: optionParts[4]?.trim() || '', answer: '' });
      }
    }
    return questions;
  }
}
