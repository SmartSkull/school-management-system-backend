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
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    const tests = await this.prisma.cbtTest.findMany({
      where: { classRoomId: student?.classRoomId },
      include: { 
        subject: true, 
        _count: { select: { questions: true } } 
      },
      orderBy: { title: 'asc' }
    });

    const data = await Promise.all(tests.map(async test => {
      const result = await this.prisma.cbtResult.findUnique({ 
        where: { testId_studentId: { testId: test.id, studentId: student!.id } } 
      });
      return { 
        id: test.id.toString(),
        title: test.title,
        course: test.subject?.name,
        question_count: test._count.questions,
        duration: test.durationMin,
        completed: !!result,
        score: result ? Number(result.score) : undefined,
        percentage: result ? Number(result.percentage) : undefined,
      };
    }));
    return this.ok(data);
  }

  async startTest(user: any, course: string) {
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    const test = await this.prisma.cbtTest.findFirst({ 
      where: {
        classRoomId: student?.classRoomId ?? null,
        subject: { name: { contains: course } },
      },
      include: { questions: true }
    });
    if (!test) throw new NotFoundException('Test not found');

    const result = await this.prisma.cbtResult.findUnique({ 
      where: { testId_studentId: { testId: test.id, studentId: student!.id } } 
    });
    if (result) throw new ForbiddenException('You have already completed this test');

    const shuffled = test.questions.sort(() => Math.random() - 0.5);
    return this.ok({ 
      id: test.id.toString(),
      title: test.title, 
      questions: shuffled.map(q => ({ id: q.id.toString(), question: q.question, options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean) })), 
      total_questions: shuffled.length, 
      duration: test.durationMin, 
      remaining_time: test.durationMin * 60 
    });
  }

  async submitAnswer(user: any, body: any) {
    const { question_id, answer } = body;
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    if (!student) throw new NotFoundException('Student not found');

    const existing = await this.prisma.cbtAnswer.findUnique({
      where: { studentId_questionId: { studentId: student.id, questionId: BigInt(question_id) } },
    });
    if (existing) {
      await this.prisma.cbtAnswer.update({
        where: { id: existing.id },
        data: { selected: answer },
      });
    } else {
      await this.prisma.cbtAnswer.create({
        data: { studentId: student.id, questionId: BigInt(question_id), selected: answer },
      });
    }
    return this.ok(null, 'Answer submitted');
  }

  async submitTest(user: any, course: string) {
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    const test = await this.prisma.cbtTest.findFirst({ 
      where: {
        classRoomId: student?.classRoomId ?? null,
        subject: { name: { contains: course } },
      },
      include: { questions: true }
    });
    if (!test || !student) throw new NotFoundException('Test or Student not found');

    const answers = await this.prisma.cbtAnswer.findMany({ 
      where: { studentId: student.id, questionId: { in: test.questions.map(q => q.id) } } 
    });

    let score = 0;
    const byQuestion = new Map(test.questions.map(q => [q.id.toString(), q.answer]));
    for (const ans of answers) {
      if (ans.selected === byQuestion.get(ans.questionId.toString())) score++;
    }

    const percentage = test.questions.length ? (score / test.questions.length) * 100 : 0;
    
    await this.prisma.cbtResult.upsert({
      where: { testId_studentId: { testId: test.id, studentId: student.id } },
      update: { score, percentage },
      create: { testId: test.id, studentId: student.id, score, percentage }
    });

    return this.ok({ score, percentage }, 'Test submitted successfully');
  }

  async getStudentResults(user: any) {
    const student = await this.prisma.student.findUnique({ where: { userId: BigInt(user.id) } });
    const results = await this.prisma.cbtResult.findMany({ 
      where: { studentId: student?.id }, 
      orderBy: { submittedAt: 'desc' },
      include: { test: true }
    });
    return this.ok(results.map(r => ({ ...r, id: r.id.toString(), test_title: r.test.title })));
  }

  async getStaffExams(user: any) {
    const tests = await this.prisma.cbtTest.findMany({
      include: { classRoom: true, subject: true },
      orderBy: { createdAt: 'desc' }
    });
    return this.ok(tests.map(t => ({
      id: t.id.toString(),
      title: t.title,
      class: t.classRoom?.name,
      course: t.subject?.name,
      duration: t.durationMin
    })));
  }

  async createQuestion(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: BigInt(user.id) } });

    let testId: bigint;
    let resolvedSubjectId: bigint | undefined;

    if (body.test_id) {
      testId = BigInt(body.test_id);
    } else {
      const { course, class: className } = body;
      if (!course || !className) throw new BadRequestException('course and class are required');

      const subject = await this.prisma.subject.findFirst({ where: { name: { contains: course } } });
      if (!subject) throw new BadRequestException(`Subject "${course}" not found`);
      resolvedSubjectId = subject.id;

      const classRoom = await this.prisma.classRoom.findFirst({ where: { name: className } });
      if (!classRoom) throw new BadRequestException(`Class "${className}" not found`);

      let sessionId: bigint | undefined;
      let termId: bigint | undefined;
      if (body.session) {
        const s = await this.prisma.academicSession.findFirst({ where: { name: body.session } });
        if (s) sessionId = s.id;
      }
      if (body.term) {
        const t = await this.prisma.academicTerm.findFirst({ where: { name: body.term as any } });
        if (t) termId = t.id;
      }

      let test = await this.prisma.cbtTest.findFirst({
        where: { subjectId: subject.id, classRoomId: classRoom.id, sessionId: sessionId ?? null, termId: termId ?? null },
      });
      if (!test) {
        test = await this.prisma.cbtTest.create({
          data: { title: `${course} — ${className}`, subjectId: subject.id, classRoomId: classRoom.id, sessionId, termId },
        });
      }
      testId = test.id;
    }

    const question = await this.prisma.cbtQuestion.create({
      data: {
        testId,
        staffId: staff?.id,
        subjectId: resolvedSubjectId,
        question: body.question,
        optionA: body.optionA,
        optionB: body.optionB,
        optionC: body.optionC,
        optionD: body.optionD,
        answer: body.answer,
      },
    });
    return this.ok({ id: question.id.toString() }, 'Question created successfully');
  }

  async getQuestions(className: string, subjectName: string, sessionName?: string, termName?: string) {
    const where: any = {};
    if (className) where.classRoom = { name: className };
    if (subjectName) where.subject = { name: subjectName };

    // Only filter by session/term if columns exist (after migration)
    let sessionId: bigint | undefined;
    let termId: bigint | undefined;
    try {
      if (sessionName) {
        const session = await this.prisma.academicSession.findFirst({ where: { name: sessionName } });
        if (session) { sessionId = session.id; where.sessionId = session.id; }
      }
      if (termName) {
        const term = await this.prisma.academicTerm.findFirst({ where: { name: termName as any } });
        if (term) { termId = term.id; where.termId = term.id; }
      }
    } catch { /* columns not yet migrated, skip */ }

    let tests: any[];
    try {
      tests = await this.prisma.cbtTest.findMany({
        where: Object.keys(where).length ? where : undefined,
        include: { classRoom: true, subject: true },
      });
    } catch {
      // Fallback without session/term filter if columns missing
      const fallbackWhere: any = {};
      if (className) fallbackWhere.classRoom = { name: className };
      if (subjectName) fallbackWhere.subject = { name: subjectName };
      tests = await this.prisma.cbtTest.findMany({
        where: Object.keys(fallbackWhere).length ? fallbackWhere : undefined,
        include: { classRoom: true, subject: true },
      });
    }

    if (!tests.length) return this.ok([]);

    const questions = await this.prisma.cbtQuestion.findMany({
      where: { testId: { in: tests.map((t: any) => t.id) } },
      orderBy: { id: 'asc' },
    });

    const testMap = new Map(tests.map((t: any) => [t.id.toString(), t]));
    return this.ok(questions.map(q => ({
      ...q,
      class: testMap.get(q.testId.toString())?.classRoom?.name,
      course: testMap.get(q.testId.toString())?.subject?.name,
    })));
  }

  async updateQuestion(id: string, body: any) {
    await this.prisma.cbtQuestion.update({
      where: { id: BigInt(id) },
      data: {
        question: body.question,
        optionA: body.optionA,
        optionB: body.optionB,
        optionC: body.optionC,
        optionD: body.optionD,
        answer: body.answer,
      },
    });
    return this.ok(null, 'Question updated successfully');
  }

  async deleteQuestion(id: string) {
    await this.prisma.cbtQuestion.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Question deleted successfully');
  }

  async getExamResults(className: string, subjectName: string) {
    const test = await this.prisma.cbtTest.findFirst({
      where: { classRoom: { name: className }, subject: { name: subjectName } }
    });
    if (!test) return this.ok([]);

    const results = await this.prisma.cbtResult.findMany({ 
      where: { testId: test.id },
      include: { student: { include: { user: true } } },
      orderBy: { score: 'desc' }
    });
    return this.ok(results.map(r => ({ 
      ...r, 
      id: r.id.toString(),
      firstname: r.student.user.firstName, 
      lastname: r.student.user.lastName 
    })));
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
    const { data, test_id } = body;
    if (!data || !test_id) throw new BadRequestException('Missing required data');
    const staff = await this.prisma.staff.findUnique({ where: { userId: BigInt(user.id) } });
    
    let count = 0;
    for (const item of data) {
      if (!item.question || !item.answer) continue;
      await this.prisma.cbtQuestion.create({ 
        data: { 
          testId: BigInt(test_id),
          staffId: staff?.id,
          question: item.question,
          optionA: item.option1 || '',
          optionB: item.option2 || '',
          optionC: item.option3 || '',
          optionD: item.option4 || '',
          answer: item.answer
        } 
      });
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
