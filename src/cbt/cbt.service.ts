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
    const now = new Date();
    const tests = await this.prisma.cbtTest.findMany({
      where: { classRoomId: student?.classRoomId },
      include: { 
        subject: true, 
        _count: { select: { questions: true } } 
      },
      orderBy: { title: 'asc' }
    });

    const data = await Promise.all(tests.map(async test => {
      // Enforce time window: if startTime/endTime are set, block access outside the window
      const withinWindow = this.isWithinSchedule(test.startTime, test.endTime, now);
      if (!withinWindow) return null;   // filtered below

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
        startTime: test.startTime,
        endTime: test.endTime,
      };
    }));
    return this.ok(data.filter(Boolean));
  }

  /** Returns true only when the current time falls within [startTime, endTime].
   *  If both are null the test has no schedule and is NOT accessible (staff hasn't set it yet). */
  private isWithinSchedule(startTime: Date | null, endTime: Date | null, now: Date): boolean {
    if (!startTime || !endTime) return false;
    return now >= startTime && now <= endTime;
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

    // Enforce time window
    const now = new Date();
    if (!this.isWithinSchedule(test.startTime, test.endTime, now)) {
      throw new ForbiddenException('This CBT is not currently available. Please check the scheduled time.');
    }

    const result = await this.prisma.cbtResult.findUnique({ 
      where: { testId_studentId: { testId: test.id, studentId: student!.id } } 
    });
    if (result) throw new ForbiddenException('You have already completed this test');

    // Seeded shuffle per student — same questions, different order for each student
    const seed = Number(BigInt(user.id) % BigInt(1000000));
    const shuffled = [...test.questions].sort((a, b) => {
      const ha = Math.sin(seed + Number(a.id)) * 10000;
      const hb = Math.sin(seed + Number(b.id)) * 10000;
      return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
    });
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
      include: { classRoom: true, subject: true, _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return this.ok(tests.map(t => ({
      id: t.id.toString(),
      title: t.title,
      class: t.classRoom?.name,
      course: t.subject?.name,
      duration: t.durationMin,
      questionCount: t._count.questions,
      startTime: t.startTime ?? null,
      endTime: t.endTime ?? null,
    })));
  }

  async updateTestSchedule(id: string, startTime: string | null, endTime: string | null) {
    const test = await this.prisma.cbtTest.findUnique({ where: { id: BigInt(id) } });
    if (!test) throw new NotFoundException('Test not found');

    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;

    if (start && end && start >= end) {
      throw new BadRequestException('Start time must be before end time');
    }

    await this.prisma.cbtTest.update({
      where: { id: BigInt(id) },
      data: { startTime: start, endTime: end },
    });
    return this.ok(null, 'Schedule updated successfully');
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
          data: { 
            title: `${course} — ${className}`, 
            subjectId: subject.id, 
            classRoomId: classRoom.id, 
            sessionId, 
            termId,
            durationMin: body.duration ? parseInt(body.duration, 10) : 30,
          },
        });
      } else if (body.duration) {
        // If the test already exists and duration is provided, update it
        test = await this.prisma.cbtTest.update({
          where: { id: test.id },
          data: { durationMin: parseInt(body.duration, 10) },
        });
      }
      testId = test.id;
    }

    // Deduplication: skip if this exact question text already exists in the test for this staff
    const existing = await this.prisma.cbtQuestion.findFirst({
      where: { testId, staffId: staff?.id, question: body.question },
    });
    if (existing) {
      return this.ok({ id: existing.id.toString() }, 'Question already exists');
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

  async getQuestions(user: any | null, className: string, subjectName: string, sessionName?: string, termName?: string) {
    // Resolve the staff record so we can filter by the logged-in staff's own questions.
    // When called from the admin endpoint (user is null) no staff filter is applied.
    const staff = user
      ? await this.prisma.staff.findUnique({ where: { userId: BigInt(user.id) } })
      : null;

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
      where: {
        testId: { in: tests.map((t: any) => t.id) },
        // Only return questions created by this staff member.
        // When staff is null (admin endpoint) all questions are returned.
        ...(staff ? { staffId: staff.id } : {}),
      },
      include: {
        // Include uploader info for admin view
        staff: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { id: 'desc' },
    });

    const testMap = new Map(tests.map((t: any) => [t.id.toString(), t]));
    return this.ok(questions.map(q => ({
      id: q.id.toString(),
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      answer: q.answer,
      createdAt: q.createdAt,
      class: testMap.get(q.testId.toString())?.classRoom?.name,
      course: testMap.get(q.testId.toString())?.subject?.name,
      testId: q.testId.toString(),
      uploadedBy: q.staff?.user
        ? `${q.staff.user.firstName} ${q.staff.user.lastName}`.trim()
        : 'Unknown',
    })));
  }

  /** Admin-only: returns a summary of all CbtTests with question count, uploader names and schedule */
  async adminGetTests(q: any) {
    const where: any = {};
    if (q.class) where.classRoom = { name: q.class };
    if (q.course) where.subject = { name: { contains: q.course } };

    const tests = await this.prisma.cbtTest.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        classRoom: true,
        subject: true,
        session: true,
        term: true,
        _count: { select: { questions: true } },
        questions: {
          distinct: ['staffId'],
          select: {
            staff: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.ok(tests.map(t => ({
      id: t.id.toString(),
      title: t.title,
      class: t.classRoom?.name ?? '—',
      course: t.subject?.name ?? '—',
      session: t.session?.name ?? '—',
      term: (t.term?.name ?? '—'),
      duration: t.durationMin,
      questionCount: t._count.questions,
      startTime: t.startTime ?? null,
      endTime: t.endTime ?? null,
      createdAt: t.createdAt,
      uploaders: t.questions
        .filter(q => q.staff?.user)
        .map(q => ({
          name: `${q.staff!.user.firstName} ${q.staff!.user.lastName}`.trim(),
          uploadedAt: q.createdAt,
        })),
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

  async bulkDeleteQuestions(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No IDs provided');
    const bigIds = ids.map(id => BigInt(id));
    const { count } = await this.prisma.cbtQuestion.deleteMany({ where: { id: { in: bigIds } } });
    return this.ok(null, `Deleted ${count} question${count !== 1 ? 's' : ''} successfully`);
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
