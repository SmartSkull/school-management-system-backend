import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CbtService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async getAvailableTests(user: any) {
    const questions = await this.prisma.cbt.findMany({ where: { class: user.class }, orderBy: { course: 'asc' } });
    const byCourse = new Map<string, any[]>();
    questions.forEach(q => byCourse.set(q.course, [...(byCourse.get(q.course) ?? []), q]));
    const tests = [];
    for (const [course, rows] of byCourse.entries()) {
      const completed = await this.hasCompleted(user, course);
      tests.push({ course, question_count: rows.length, duration: Math.max(...rows.map(r => Number(r.duration ?? 30))), completed });
    }
    return this.ok(tests);
  }

  async startTest(user: any, course: string) {
    if (await this.hasCompleted(user, course)) throw new ForbiddenException('You have already completed this test');
    const questions = await this.prisma.cbt.findMany({
      where: { class: user.class, course },
      select: { cbt_id: true, question: true, option1: true, option2: true, option3: true, option4: true, duration: true },
    });
    if (!questions.length) throw new NotFoundException('No questions found for this test');
    const shuffled = questions.sort(() => Math.random() - 0.5);
    const duration = shuffled[0]?.duration || 30;
    return this.ok({ course, questions: shuffled, total_questions: shuffled.length, duration, remaining_time: duration * 60 });
  }

  async submitAnswer(user: any, body: any) {
    const { cbt_id, answer, course } = body;
    if (!cbt_id || !answer || !course) throw new BadRequestException('cbt_id, answer, and course are required');
    const where = { cbt_id: String(cbt_id), student_id: user.student_id };
    const existing = await this.prisma.student_answer.findFirst({ where, select: { id: true } });
    if (existing) {
      await this.prisma.student_answer.updateMany({ where, data: { student_pick: answer } });
    } else {
      await this.prisma.student_answer.create({ data: { cbt_id: String(cbt_id), student_pick: answer, class: user.class, course, student_id: user.student_id } });
    }
    return this.ok(null, 'Answer submitted');
  }

  async submitTest(user: any, course: string) {
    const answers = await this.prisma.student_answer.findMany({ where: { student_id: user.student_id, course } });
    const questionIds = answers.map(a => Number(a.cbt_id)).filter(Boolean);
    const questions = await this.prisma.cbt.findMany({ where: { cbt_id: { in: questionIds } }, select: { cbt_id: true, answer: true } });
    const byId = new Map(questions.map(q => [String(q.cbt_id), q.answer]));
    const score = answers.filter(a => a.student_pick === byId.get(String(a.cbt_id))).length;
    if (!(await this.hasCompleted(user, course))) {
      await this.prisma.cbt_result.create({ data: { student_id: user.student_id, cbt_id: String(questionIds[0] ?? ''), student_score: String(score), score, percentage: answers.length ? (score / answers.length) * 100 : 0, submitted_at: new Date() } });
    }
    return this.ok({ score }, 'Test submitted successfully');
  }

  async getStudentResults(user: any) {
    return this.ok(await this.prisma.cbt_result.findMany({ where: { student_id: user.student_id }, orderBy: { id: 'desc' } }));
  }

  async getStaffExams(user: any) {
    const staffId = user.unique_id ?? user.student_id;
    const rows = await this.prisma.cbt.findMany({ where: { staff_id: staffId }, select: { class: true, course: true, duration: true } });
    return this.ok([...new Map(rows.map(r => [`${r.class}:${r.course}:${r.duration}`, r])).values()]);
  }

  async createQuestion(user: any, body: any) {
    const staffId = user.unique_id ?? user.student_id;
    const question = await this.prisma.cbt.create({ data: this.cbtData({ ...body, staff_id: staffId, duration: body.duration || 30 }) });
    return this.ok({ id: question.cbt_id }, 'Question created successfully');
  }

  async getQuestions(cls: string, course: string) {
    if (!cls || !course) throw new BadRequestException('Class and course are required');
    return this.ok(await this.prisma.cbt.findMany({ where: { class: cls, course } }));
  }

  async deleteQuestion(id: number) {
    await this.prisma.cbt.deleteMany({ where: { cbt_id: id } });
    return this.ok(null, 'Question deleted successfully');
  }

  async getExamResults(cls: string, course: string) {
    if (!cls || !course) throw new BadRequestException('Class and course are required');
    const answers = await this.prisma.student_answer.findMany({ where: { class: cls, course }, select: { student_id: true } });
    const ids = [...new Set(answers.map(a => a.student_id))];
    const [results, users] = await Promise.all([
      this.prisma.cbt_result.findMany({ where: { student_id: { in: ids } } }),
      this.prisma.users.findMany({ where: { student_id: { in: ids } }, select: { student_id: true, firstname: true, lastname: true } }),
    ]);
    const byId = new Map(users.map(u => [u.student_id, u]));
    return this.ok(results.map(r => ({ ...r, firstname: byId.get(r.student_id)?.firstname, lastname: byId.get(r.student_id)?.lastname })));
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
      await this.prisma.cbt.create({ data: this.cbtData({ class: cls, course, staff_id: staffId, question: item.question, option1: item.option1 || '', option2: item.option2 || '', option3: item.option3 || '', option4: item.option4 || '', answer: item.answer, duration: +duration }) });
      count++;
    }
    return this.ok(null, `Successfully imported ${count} questions`);
  }

  private async hasCompleted(user: any, course: string) {
    const answers = await this.prisma.student_answer.findMany({ where: { student_id: user.student_id, course }, select: { cbt_id: true } });
    if (!answers.length) return false;
    const result = await this.prisma.cbt_result.findFirst({ where: { student_id: user.student_id, cbt_id: { in: answers.map(a => String(a.cbt_id)) } }, select: { id: true } });
    return !!result;
  }

  private cbtData(data: any) {
    return {
      staff_id: data.staff_id || '',
      class: data.class || '',
      course: data.course || '',
      question: data.question || '',
      option1: data.option1 || '',
      option2: data.option2 || '',
      option3: data.option3 || '',
      option4: data.option4 || '',
      answer: data.answer || '',
      number: data.number || '',
      time_frame: data.time_frame || '',
      status: data.status || '',
      date: data.date || String(new Date()),
      updated: data.updated || '',
      duration: Number(data.duration || 30),
    };
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
