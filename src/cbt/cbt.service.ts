import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

    // Fetch questions ordered by sectionOrder then id so sections are stable
    const allQuestions = await this.prisma.cbtQuestion.findMany({
      where: { testId: test.id },
      orderBy: [{ sectionOrder: 'asc' }, { id: 'asc' }],
    });

    // Seeded shuffle WITHIN each section only — sections stay in order
    const seed = Number(BigInt(user.id) % BigInt(1000000));

    // Group by sectionOrder
    const sectionMap = new Map<number, typeof allQuestions>();
    for (const q of allQuestions) {
      const order = q.sectionOrder ?? 0;
      if (!sectionMap.has(order)) sectionMap.set(order, []);
      sectionMap.get(order)!.push(q);
    }

    // Shuffle within each section using the student seed
    const shuffled: typeof allQuestions = [];
    for (const [, group] of [...sectionMap.entries()].sort((a, b) => a[0] - b[0])) {
      const shuffledGroup = [...group].sort((a, b) => {
        const ha = Math.sin(seed + Number(a.id)) * 10000;
        const hb = Math.sin(seed + Number(b.id)) * 10000;
        return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
      });
      shuffled.push(...shuffledGroup);
    }

    return this.ok({ 
      id: test.id.toString(),
      title: test.title, 
      questions: shuffled.map(q => ({
        id: q.id.toString(),
        question: q.question,
        options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean),
        sectionLabel: q.sectionLabel ?? null,
        sectionOrder: q.sectionOrder,
      })), 
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

  async updateTest(id: string, body: any) {
    const course = body.course?.trim();
    if (!course) {
      throw new BadRequestException('Course is required');
    }

    const test = await this.prisma.cbtTest.findUnique({
      where: { id: BigInt(id) },
      include: { classRoom: true },
    });
    if (!test) throw new NotFoundException('Test not found');

    const subject = await this.prisma.subject.findFirst({ where: { name: course } });
    if (!subject) {
      throw new BadRequestException(`Subject "${course}" not found`);
    }

    const title = `${subject.name}${test.classRoom?.name ? ` — ${test.classRoom.name}` : ''}`;

    await this.prisma.cbtTest.update({
      where: { id: test.id },
      data: { subjectId: subject.id, title },
    });

    await this.prisma.cbtQuestion.updateMany({
      where: { testId: test.id },
      data: { subjectId: subject.id },
    });

    return this.ok(null, 'Test updated successfully');
  }

  async createQuestion(user: any, body: any) {
    const staffUserId = BigInt(user.authUserId ?? user.userId ?? user.id);
    const staff = await this.prisma.staff.findFirst({ where: { userId: staffUserId } });

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
        sectionLabel: body.sectionLabel || null,
        sectionOrder: parseInt(String(body.sectionOrder ?? 0), 10) || 0,
      },
    });
    return this.ok({ id: question.id.toString() }, 'Question created successfully');
  }

  async getQuestions(user: any | null, className: string, subjectName: string, sessionName?: string, termName?: string) {
    // Resolve the staff record so we can filter by the logged-in staff's own questions.
    // When called from the admin endpoint (user is null) no staff filter is applied.
    const staffUserId = user ? BigInt(user.authUserId ?? user.userId ?? user.id) : null;
    const staff = staffUserId
      ? await this.prisma.staff.findFirst({ where: { userId: staffUserId } })
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
        ...(staff ? { staffId: staff.id } : {}),
      },
      include: {
        staff: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ sectionOrder: 'asc' }, { id: 'asc' }],
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
      sectionLabel: q.sectionLabel ?? null,
      sectionOrder: q.sectionOrder,
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
        .map(q => ({
          name: q.staff?.user
            ? `${q.staff.user.firstName} ${q.staff.user.lastName}`.trim()
            : 'Unknown',
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
        sectionLabel: body.sectionLabel !== undefined ? (body.sectionLabel || null) : undefined,
        sectionOrder: body.sectionOrder !== undefined ? (parseInt(String(body.sectionOrder), 10) || 0) : undefined,
      },
    });
    return this.ok(null, 'Question updated successfully');
  }

  async deleteResult(id: string) {
    await this.prisma.cbtResult.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Result deleted successfully');
  }

  async bulkDeleteQuestions(ids: string) {
    const idArray = (ids || '').split(',').map(id => id.trim()).filter(Boolean);
    if (!idArray.length) throw new BadRequestException('No IDs provided');
    const bigIds = idArray.map(id => BigInt(id));
    const { count } = await this.prisma.cbtQuestion.deleteMany({ where: { id: { in: bigIds } } });
    return this.ok(null, `Deleted ${count} question${count !== 1 ? 's' : ''} successfully`);
  }

  async deleteQuestion(id: string) {
    await this.prisma.cbtQuestion.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Question deleted successfully');
  }

  async adminDeleteTest(id: string) {
    const testId = BigInt(id);

    // 1. Get all question IDs for this test
    const questions = await this.prisma.cbtQuestion.findMany({
      where: { testId },
      select: { id: true },
    });
    const questionIds = questions.map(q => q.id);

    // 2. Delete CbtAnswers referencing those questions (no cascade on schema)
    if (questionIds.length > 0) {
      await this.prisma.cbtAnswer.deleteMany({ where: { questionId: { in: questionIds } } });
    }

    // 3. Delete CbtResults referencing this test (no cascade on schema)
    await this.prisma.cbtResult.deleteMany({ where: { testId } });

    // 4. Delete the questions
    const { count } = await this.prisma.cbtQuestion.deleteMany({ where: { testId } });

    // 5. Delete the test itself
    await this.prisma.cbtTest.delete({ where: { id: testId } });

    return this.ok(null, `Deleted test and ${count} question${count !== 1 ? 's' : ''} successfully`);
  }

  async getExamResults(user: any, className?: string, subjectName?: string, sessionName?: string, termName?: string, teacherId?: string) {
    const schoolId = user?.schoolId;
    const isAdmin = user?.role === 'admin';

    const classRoomWhere: any = {};
    if (!isAdmin && schoolId) classRoomWhere.schoolId = schoolId;
    if (className) classRoomWhere.name = className;

    const subjectWhere: any = {};
    if (subjectName) subjectWhere.name = subjectName;

    const where: any = {};
    if (Object.keys(classRoomWhere).length) where.classRoom = classRoomWhere;
    if (Object.keys(subjectWhere).length) where.subject = subjectWhere;

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
    } catch { /* columns not yet migrated */ }

    let resolvedTeacherStaffId: bigint | undefined;
    if (teacherId) {
      const parts = String(teacherId).split(' ').filter(Boolean);
      const staffWhere: any = { user: {} };
      if (parts[0]) staffWhere.user.firstName = { contains: parts[0] };
      if (parts.length > 1) staffWhere.user.lastName = { contains: parts.slice(1).join(' ') };
      const staff = await this.prisma.staff.findFirst({ where: staffWhere, select: { id: true } });
      if (staff) resolvedTeacherStaffId = staff.id;
    }

    const tests = await this.prisma.cbtTest.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        classRoom: { include: { classTeacher: { include: { user: true } } } },
        subject: { include: { teacher: { include: { user: true } } } },
        session: true,
        term: true,
      },
    });

    let filteredTests = tests;
    if (resolvedTeacherStaffId) {
      filteredTests = tests.filter(t => {
        const classTeacherId = (t.classRoom as any)?.classTeacher?.id ?? null;
        const subjectTeacherId = (t.subject as any)?.teacher?.id ?? null;
        return classTeacherId === resolvedTeacherStaffId || subjectTeacherId === resolvedTeacherStaffId;
      });
    }

    if (!filteredTests.length) return this.ok([]);

    const testIds = filteredTests.map(t => t.id);

    const results = await this.prisma.cbtResult.findMany({
      where: { testId: { in: testIds } },
      include: {
        test: {
          include: {
            classRoom: { include: { classTeacher: { include: { user: true } } } },
            subject: { include: { teacher: { include: { user: true } } } },
            session: true,
            term: true,
          },
        },
        student: { include: { user: true } },
      },
      orderBy: { score: 'desc' },
    });

    return this.ok(results.map((r) => {
      const test = r.test;
      const classTeacher = (test as any)?.classRoom?.classTeacher?.user ? `${(test as any).classRoom.classTeacher.user.firstName} ${(test as any).classRoom.classTeacher.user.lastName}`.trim() : '';
      const subjectTeacher = (test as any)?.subject?.teacher?.user ? `${(test as any).subject.teacher.user.firstName} ${(test as any).subject.teacher.user.lastName}`.trim() : '';
      const teachers = [classTeacher, subjectTeacher].filter(Boolean);
      return {
        ...r,
        id: r.id.toString(),
        firstname: r.student.user.firstName,
        lastname: r.student.user.lastName,
        test_title: test.title,
        class: test.classRoom?.name ?? '—',
        subject: test.subject?.name ?? '—',
        session: test.session?.name ?? '—',
        term: test.term?.name ?? '—',
        teachers,
      };
    }));
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
    const { data, course, class: className, session, term, duration } = body;
    if (!Array.isArray(data) || !data.length) throw new BadRequestException('Missing questions data');
    if (!course || !className) throw new BadRequestException('course and class are required');

    const staffUserId = BigInt(user.authUserId ?? user.userId ?? user.id);
    const staff = await this.prisma.staff.findFirst({ where: { userId: staffUserId } });

    // Resolve or create the test (same logic as createQuestion)
    const subject = await this.prisma.subject.findFirst({ where: { name: { contains: course } } });
    if (!subject) throw new BadRequestException(`Subject "${course}" not found`);
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: className } });
    if (!classRoom) throw new BadRequestException(`Class "${className}" not found`);

    let sessionId: bigint | undefined;
    let termId: bigint | undefined;
    if (session) { const s = await this.prisma.academicSession.findFirst({ where: { name: session } }); if (s) sessionId = s.id; }
    if (term)    { const t = await this.prisma.academicTerm.findFirst({ where: { name: term as any } }); if (t) termId = t.id; }

    let test = await this.prisma.cbtTest.findFirst({
      where: { subjectId: subject.id, classRoomId: classRoom.id, sessionId: sessionId ?? null, termId: termId ?? null },
    });
    if (!test) {
      test = await this.prisma.cbtTest.create({
        data: { title: `${course} — ${className}`, subjectId: subject.id, classRoomId: classRoom.id, sessionId, termId, durationMin: duration ? parseInt(duration, 10) : 30 },
      });
    } else if (duration) {
      test = await this.prisma.cbtTest.update({ where: { id: test.id }, data: { durationMin: parseInt(duration, 10) } });
    }

    // Bulk insert all questions in one transaction
    const rows = data
      .filter((item: any) => item.question && item.answer)
      .map((item: any) => ({
        testId: test!.id,
        staffId: staff?.id,
        subjectId: subject.id,
        question: item.question,
        optionA: item.option1 || '',
        optionB: item.option2 || '',
        optionC: item.option3 || null,
        optionD: item.option4 || null,
        answer: item.answer,
        sectionLabel: item.sectionLabel || null,
        sectionOrder: parseInt(String(item.sectionOrder ?? 0), 10) || 0,
      }));

    const { count } = await this.prisma.cbtQuestion.createMany({ data: rows, skipDuplicates: false });
    return this.ok({ count }, `Successfully imported ${count} questions`);
  }



  // ─── Desktop App: Export test data ────────────────────────────────────────
  // Returns everything the desktop app needs to run a test offline:
  // the test metadata, all questions, and all students in that class.
  async exportTestForDesktop(id: string) {
    const test = await this.prisma.cbtTest.findUnique({
      where: { id: BigInt(id) },
      include: {
        subject: true,
        classRoom: true,
        session: true,
        term: true,
        questions: true,
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    // Fetch all students enrolled in this class
    const students = await this.prisma.student.findMany({
      where: { classRoomId: test.classRoomId ?? undefined },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return this.ok({
      test: {
        id: test.id.toString(),
        schoolId: test.classRoom ? null : null,      // schoolId derived below via classRoom
        title: test.title,
        subjectName: test.subject?.name ?? '',
        className: test.classRoom?.name ?? '',
        durationMin: test.durationMin,
        startTime: test.startTime ?? null,
        endTime: test.endTime ?? null,
      },
      questions: test.questions.map(q => ({
        id: q.id.toString(),
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC ?? null,
        optionD: q.optionD ?? null,
        answer: q.answer,
        sectionLabel: q.sectionLabel ?? null,
        sectionOrder: q.sectionOrder,
      })),
      students: students.map(s => ({
        id: s.id.toString(),
        admissionNumber: s.studentNo ?? '',
        firstname: s.user.firstName,
        lastname: s.user.lastName,
        className: test.classRoom?.name ?? '',
      })),
    });
  }

  // ─── Admin: get exam results ──────────────────────────────────────────────
  async adminGetExamResults(user: any, className?: string, subjectName?: string, sessionName?: string, termName?: string, teacherId?: string) {
    return this.getExamResults(user, className, subjectName, sessionName, termName, teacherId);
  }

  // ─── Desktop App: Import results ──────────────────────────────────────────
  // Receives bulk results + answers from the desktop app after an offline exam.
  // Skips records that already exist (idempotent by testId+studentId / studentId+questionId).
  async importResultsFromDesktop(body: any) {
    const { results, answers } = body;

    if (!Array.isArray(results) || !Array.isArray(answers)) {
      throw new BadRequestException('Invalid payload: results and answers must be arrays');
    }

    let answersInserted = 0;
    let resultsInserted = 0;

    if (answers.length) {
      const wantedPairs = answers.map(a => ({
        studentId: BigInt(a.studentId),
        questionId: BigInt(a.questionId),
      }));

      const existingPairs = new Set(
        (await this.prisma.cbtAnswer.findMany({
          where: { OR: wantedPairs.map(p => ({ studentId: p.studentId, questionId: p.questionId })) },
          select: { studentId: true, questionId: true },
        })).map(e => `${e.studentId}:${e.questionId}`),
      );

      const missingAnswers = answers.filter(a => {
        const key = `${BigInt(a.studentId)}:${BigInt(a.questionId)}`;
        return !existingPairs.has(key);
      });

      if (missingAnswers.length) {
        await this.prisma.cbtAnswer.createMany({
          data: missingAnswers.map(a => ({
            studentId: BigInt(a.studentId),
            questionId: BigInt(a.questionId),
            selected: a.selectedAnswer,
          })),
        });
        answersInserted = missingAnswers.length;
      }
    }

    if (results.length) {
      const wantedPairs = results.map(r => ({
        testId: BigInt(r.testId),
        studentId: BigInt(r.studentId),
      }));

      const existingPairs = new Set(
        (await this.prisma.cbtResult.findMany({
          where: { OR: wantedPairs.map(p => ({ testId: p.testId, studentId: p.studentId })) },
          select: { testId: true, studentId: true },
        })).map(e => `${e.testId}:${e.studentId}`),
      );

      const missingResults = results.filter(r => {
        const key = `${BigInt(r.testId)}:${BigInt(r.studentId)}`;
        return !existingPairs.has(key);
      });

      if (missingResults.length) {
        await this.prisma.cbtResult.createMany({
          data: missingResults.map(r => ({
            testId: BigInt(r.testId),
            studentId: BigInt(r.studentId),
            score: r.score,
            percentage: r.percentage,
            submittedAt: r.submittedAt ? new Date(r.submittedAt) : new Date(),
          })),
        });
        resultsInserted = missingResults.length;
      }
    }

    return this.ok(
      { resultsInserted, answersInserted },
      `Imported ${resultsInserted} results and ${answersInserted} answers`,
    );
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
