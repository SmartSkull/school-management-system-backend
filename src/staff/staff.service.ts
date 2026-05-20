import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { uploadToCloudinary } from '../common/cloudinary';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  private safeBigInt(val: any): bigint | null {
    if (!val) return null;
    const n = Number(val);
    return isNaN(n) ? null : BigInt(Math.trunc(n));
  }

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  private userId(user: any): bigint {
    return BigInt(user.authUserId ?? user.userId ?? user.user?.id ?? user.id);
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.academicSession.findFirst({ where: { isCurrent: true } })
      ?? await this.prisma.academicSession.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.academicTerm.findFirst({ where: { isCurrent: true } })
      ?? await this.prisma.academicTerm.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  async dashboard(user: any) {
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();

    const userInfo = user.user ?? user;
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findUnique({ 
      where: { id: BigInt(user.id) },
      include: { classRooms: true }
    });

    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    const classRoomId = staff?.classRooms[0]?.id;

    const [studentCount, assignments, libraryItems] = await Promise.all([
      this.prisma.user.count({ 
        where: { role: 'STUDENT', ...(schoolId ? { schoolId } : {}), student: { classRoomId } } 
      }),
      this.prisma.assignment.findMany({ 
        where: { staffId: staff?.id }, 
        orderBy: { createdAt: 'desc' } 
      }),
      this.prisma.libraryResource.findMany({ 
        where: { staffId: staff?.id }, 
        orderBy: { createdAt: 'desc' } 
      }),
    ]);

    // --- Chart 1: Student Performance Distribution (real results) ---
    const results = sessionEntity && termEntity && classRoomId
      ? await this.prisma.result.findMany({
          where: {
            sessionId: sessionEntity.id,
            termId: termEntity.id,
            student: { classRoomId, ...(schoolId ? { user: { schoolId } } : {}) },
          },
          select: { testScore: true, examScore: true },
        })
      : [];

    const gradeBuckets = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of results) {
      const total = Number(r.testScore) + Number(r.examScore);
      if (total >= 90) gradeBuckets.A++;
      else if (total >= 80) gradeBuckets.B++;
      else if (total >= 70) gradeBuckets.C++;
      else if (total >= 60) gradeBuckets.D++;
      else gradeBuckets.F++;
    }
    const performanceDistribution = [
      { grade: 'A (90-100)', count: gradeBuckets.A },
      { grade: 'B (80-89)', count: gradeBuckets.B },
      { grade: 'C (70-79)', count: gradeBuckets.C },
      { grade: 'D (60-69)', count: gradeBuckets.D },
      { grade: 'F (<60)',   count: gradeBuckets.F },
    ];

    // --- Chart 2: Assignment Submission Trend (last 5 assignments) ---
    const recentAssignments = assignments.slice(0, 5).reverse();
    const assignmentTrend = await Promise.all(
      recentAssignments.map(async (a, i) => {
        const total = classRoomId
          ? await this.prisma.user.count({ where: { role: 'STUDENT', ...(schoolId ? { schoolId } : {}), student: { classRoomId } } })
          : studentCount;
        const submitted = a.subjectId && sessionEntity && termEntity
          ? await this.prisma.result.count({
              where: {
                subjectId: a.subjectId,
                sessionId: sessionEntity.id,
                termId: termEntity.id,
                ...(classRoomId ? { student: { classRoomId, ...(schoolId ? { user: { schoolId } } : {}) } } : {}),
              },
            })
          : 0;
        return { week: `Assign ${i + 1}`, label: a.title?.slice(0, 12) ?? `Assign ${i + 1}`, submitted, total };
      })
    );

    // --- Chart 3: Student Distribution by Class ---
    const classRooms = schoolId
      ? await this.prisma.classRoom.findMany({ where: { schoolId }, orderBy: { name: 'asc' } })
      : staff?.classRooms ?? [];

    const classDistribution = await Promise.all(
      classRooms.map(async (c) => ({
        name: c.name,
        value: await this.prisma.student.count({ where: { classRoomId: c.id, ...(schoolId ? { user: { schoolId } } : {}) } }),
      }))
    );

    return this.ok({ 
      user: {
        firstname: userInfo.firstName,
        lastname: userInfo.lastName,
        image: userInfo.image,
        uniqueId: userInfo.uniqueId,
      },
      current_session: session, 
      current_term: term, 
      total_students: studentCount,
      total_assignments: assignments.length,
      total_library: libraryItems.length,
      analytics: { 
        assignments: { total: assignments.length, recent: assignments.slice(0, 5) }, 
        library: { 
          total: libraryItems.length, 
          verified: libraryItems.filter((i: any) => i.status === 'APPROVED').length, 
          pending: libraryItems.filter((i: any) => i.status === 'PENDING').length 
        },
        performanceDistribution,
        assignmentTrend,
        classDistribution,
      } 
    });
  }

  async profile(user: any) {
    const profile = await this.prisma.user.findUnique({ 
      where: { id: this.userId(user), ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) },
      include: { staff: true }
    });
    return this.ok(profile);
  }

  async updateProfile(user: any, data: any) {
    const allowed = ['firstName', 'lastName', 'email', 'telephone'];
    const update: any = {};
    allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
    
    const staffAllowed = ['dateOfBirth', 'stateOfOrigin', 'homeAddress', 'about'];
    const staffUpdate: any = {};
    staffAllowed.forEach(k => { if (data[k] !== undefined) staffUpdate[k] = data[k]; });

    if (Object.keys(update).length || Object.keys(staffUpdate).length) {
      await this.prisma.user.update({ 
        where: { id: this.userId(user), ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, 
        data: {
          ...update,
          staff: { update: staffUpdate }
        }
      });
    }
    return this.ok(null, 'Profile updated successfully');
  }

  async updateImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    const url = await uploadToCloudinary(file, 'florieren/staff');
    await this.prisma.user.update({ where: { id: this.userId(user), ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) }, data: { image: url } });
    return this.ok({ image: url }, 'Image updated successfully');
  }

  async getStudents(user: any, cls?: string, search?: string) {
    const schoolId = this.schoolId(user);
    const conditions: any[] = [{ role: 'STUDENT' }, { status: 'ACTIVE' }];
    if (schoolId) conditions.push({ schoolId });

    if (cls) {
      conditions.push({ student: { classRoom: { name: cls } } });
    } else {
      const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) }, include: { classRooms: true } });
      if (staff?.classRooms?.length) conditions.push({ student: { classRoomId: staff.classRooms[0].id } });
    }

    if (search) {
      conditions.push({ OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { uniqueId: { contains: search } },
        { email: { contains: search } },
      ]});
    }

    const students = await this.prisma.user.findMany({
      where: { AND: conditions },
      include: { student: { include: { classRoom: true } } }
    });
    return this.ok(students.map(s => ({
      student_id: s.uniqueId,
      firstname: s.firstName,
      lastname: s.lastName,
      email: s.email,
      class: s.student?.classRoom?.name ?? '',
      image: s.image,
    })));
  }

  async getStudentDetails(user: any, id: string) {
    const student = await this.prisma.user.findUnique({ 
      where: { uniqueId: id, ...(this.schoolId(user) ? { schoolId: this.schoolId(user) } : {}) },
      include: { student: { include: { classRoom: true } } }
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.ok(student);
  }

  async uploadResult(user: any, body: any) {
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.course } });

    if (!sessionEntity || !termEntity || !staff || !subject) {
      throw new BadRequestException('Session, Term, Staff, or Subject not found');
    }

    if (Array.isArray(body.results)) {
      let count = 0;
      for (const r of body.results) {
        if (!r.student_id) continue;
        const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: r.student_id, ...(schoolId ? { schoolId } : {}) } } });
        if (!student) continue;

        await this.prisma.result.upsert({
          where: {
            studentId_subjectId_sessionId_termId: {
              studentId: student.id,
              subjectId: subject.id,
              sessionId: sessionEntity.id,
              termId: termEntity.id,
            }
          },
          update: {
            testScore: parseFloat(r.test_score) || 0,
            examScore: parseFloat(r.exam_score) || 0,
            teacherId: staff.id,
          },
          create: {
            studentId: student.id,
            subjectId: subject.id,
            sessionId: sessionEntity.id,
            termId: termEntity.id,
            testScore: parseFloat(r.test_score) || 0,
            examScore: parseFloat(r.exam_score) || 0,
            teacherId: staff.id,
          }
        });
        count++;
      }
      return this.ok({ count }, `Successfully saved ${count} result(s)`);
    }

    return this.ok(null, 'Result upload format error');
  }



  async getResults(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    if (q.student_id) {
      const schoolId = this.schoolId(user);
      const studentRecord = await this.prisma.student.findFirst({ 
        where: { user: { uniqueId: q.student_id, ...(schoolId ? { schoolId } : {}) } },
        include: { user: true, classRoom: true }
      });
      const results = await this.resultsWithTotals({ 
        studentId: studentRecord?.id, 
        sessionId: sessionEntity?.id, 
        termId: termEntity?.id 
      });

      // Get teacher for this class via classRoom.classTeacher
      const classWithTeacher = studentRecord?.classRoom ? await this.prisma.classRoom.findUnique({
        where: { id: studentRecord.classRoom.id },
        include: { classTeacher: { include: { user: true } } }
      }) : null;
      const classTeacher = classWithTeacher?.classTeacher ?? null;

      // Get principal
      const principal = await this.prisma.user.findFirst({ where: { role: 'ADMIN', ...(schoolId ? { schoolId } : {}) }, select: { firstName: true, lastName: true, image: true } });

      // Get attendance
      const attendance = await this.prisma.attendance.findFirst({
        where: { studentId: studentRecord?.id, sessionId: sessionEntity?.id, termId: termEntity?.id }
      });

      return this.ok({
        results,
        student: studentRecord ? {
          firstName: studentRecord.user.firstName,
          lastName: studentRecord.user.lastName,
          image: studentRecord.user.image,
          uniqueId: studentRecord.user.uniqueId,
        } : null,
        class: studentRecord?.classRoom?.name,
        teacher: classTeacher ? { name: `${classTeacher.user.firstName} ${classTeacher.user.lastName}`, image: classTeacher.user.image } : null,
        principal: principal ? { name: `${principal.firstName} ${principal.lastName}`, image: principal.image } : null,
        attendance,
      });
    }

    const cls = q.class || user.class;
    const schoolId = this.schoolId(user);
    const students = await this.prisma.user.findMany({ 
      where: { role: 'STUDENT', ...(schoolId ? { schoolId } : {}), student: { classRoom: { name: cls, ...(schoolId ? { schoolId } : {}) } } },
      include: { student: true }
    });
    
    const studentIds = students.map(s => s.student?.id).filter(Boolean) as bigint[];
    const approvedFilter = q.approved === 'approved' ? { not: null } : q.approved === 'pending' ? null : undefined;
    const results = await this.prisma.result.findMany({
      where: {
        sessionId: sessionEntity?.id,
        termId: termEntity?.id,
        studentId: { in: studentIds },
        ...(q.course ? { subject: { name: q.course } } : {}),
        ...(approvedFilter !== undefined ? { approvedAt: approvedFilter } : {}),
      },
      include: { student: { include: { user: true } }, subject: true }
    });

    const data = results.map(r => ({
      ...r,
      student_id: r.student.user.uniqueId,
      firstname: r.student.user.firstName,
      lastname: r.student.user.lastName,
      course: r.subject.name,
      test_score: r.testScore,
      exam_score: r.examScore,
      total_score: Number(r.testScore || 0) + Number(r.examScore || 0),
    }));

    return this.ok(data);
  }

  async deleteResult(user: any, body: any) {
    const { course, session, term, student_ids } = body;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    const subject = await this.prisma.subject.findFirst({ where: { name: course } });

    if (!Array.isArray(student_ids)) throw new BadRequestException('student_ids must be an array');
    
    let count = 0;
    for (const id of student_ids) {
      const schoolId = this.schoolId(user);
      const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: id, ...(schoolId ? { schoolId } : {}) } } });
      if (!student) continue;
      
      const affected = await this.prisma.result.deleteMany({ 
        where: { studentId: student.id, subjectId: subject?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      if (affected.count) count++;
    }
    return this.ok({ count }, `Successfully deleted ${count} result(s)`);
  }

  async getAttendance(user: any, q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    if (q.student_id) {
      const schoolId = this.schoolId(user);
      const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: q.student_id, ...(schoolId ? { schoolId } : {}) } } });
      const att = await this.prisma.attendance.findFirst({ 
        where: { studentId: student?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      return this.ok(att);
    }
    
    if (q.class) {
      const schoolId = this.schoolId(user);
      const students = await this.prisma.user.findMany({ 
        where: { role: 'STUDENT', ...(schoolId ? { schoolId } : {}), student: { classRoom: { name: q.class, ...(schoolId ? { schoolId } : {}) } } },
        include: { student: true }
      });
      const studentIds = students.map(s => s.student?.id).filter(Boolean) as bigint[];
      const records = await this.prisma.attendance.findMany({ 
        where: { studentId: { in: studentIds }, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      return this.ok(records);
    }
    throw new BadRequestException('student_id or class is required');
  }

  async updateAttendance(user: any, body: any) {
    const session = body.session || await this.getCurrentSession();
    const term = body.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    if (!sessionEntity || !termEntity) throw new BadRequestException('Session or Term not found');

    if (Array.isArray(body.students)) {
      let count = 0;
      for (const s of body.students) {
        if (!s.student_id) continue;
        await this.upsertAttendance(user, s.student_id, s.present || 0, s.absent || 0, sessionEntity.id, termEntity.id);
        count++;
      }
      return this.ok({ count }, `Saved attendance for ${count} student(s)`);
    }

    await this.upsertAttendance(user, body.student_id, body.present, body.absent, sessionEntity.id, termEntity.id);
    return this.ok(null, 'Attendance updated successfully');
  }

  private async upsertAttendance(user: any, studentUniqueId: string, present: number, absent: number, sessionId: bigint, termId: bigint) {
    const schoolId = this.schoolId(user);
    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: studentUniqueId, ...(schoolId ? { schoolId } : {}) } } });
    if (!student) return;

    await this.prisma.attendance.upsert({
      where: {
        studentId_sessionId_termId: {
          studentId: student.id,
          sessionId,
          termId,
        }
      },
      update: {
        present: Number(present),
        absent: Number(absent),
      },
      create: {
        studentId: student.id,
        sessionId,
        termId,
        present: Number(present),
        absent: Number(absent),
      }
    });
  }

  async addComment(user: any, body: any) {
    const { student_id, comment, session, term } = body;
    if (!student_id || !comment || !session || !term) throw new BadRequestException('All fields required');
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term.toUpperCase() as any, sessionId: sessionEntity?.id } });
    const schoolId = this.schoolId(user);
    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: student_id, ...(schoolId ? { schoolId } : {}) } } });

    if (!sessionEntity || !termEntity || !student) throw new BadRequestException('Session, Term, or Student not found');

    await this.prisma.attendance.upsert({
      where: {
        studentId_sessionId_termId: {
          studentId: student.id,
          sessionId: sessionEntity.id,
          termId: termEntity.id,
        }
      },
      update: { teacherComment: comment },
      create: {
        studentId: student.id,
        sessionId: sessionEntity.id,
        termId: termEntity.id,
        teacherComment: comment,
      }
    });
    return this.ok(null, 'Comment added successfully');
  }

  async createAssignment(user: any, body: any, file?: Express.Multer.File) {
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: body.class, ...(schoolId ? { schoolId } : {}) } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.subject, ...(schoolId ? { classRoom: { schoolId } } : {}) } });

    const fileUrl = file ? await uploadToCloudinary(file, 'florieren/assignments') : null;
    const assignment = await this.prisma.assignment.create({ 
      data: { 
        title: body.subject || 'Assignment', 
        content: body.assignment, 
        dueAt: body.deadline ? new Date(body.deadline) : null, 
        staffId: staff!.id, 
        classRoomId: classRoom?.id,
        subjectId: subject?.id,
        file: fileUrl
      } 
    });
    return this.ok({ id: assignment.id.toString() }, 'Assignment created successfully');
  }

  async getAssignments(user: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const assignments = await this.prisma.assignment.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true }
    });
    return this.ok(assignments.map(a => ({
      id: a.id.toString(),
      title: a.title,
      subject: a.title,
      assignment: a.content,
      description: a.content,
      class: a.classRoom?.name ?? '',
      deadline: a.dueAt,
      due_date: a.dueAt,
      file: a.file,
      file_url: a.file ? `/uploads/assignments/${a.file}` : null,
      createdAt: a.createdAt,
    })));
  }

  async updateAssignment(user: any, id: number, body: any, file?: Express.Multer.File) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const assignment = await this.prisma.assignment.findUnique({ where: { id: BigInt(id) } });
    if (!assignment || assignment.staffId !== staff?.id) throw new NotFoundException('Assignment not found');
    
    const data: any = {};
    if (body.assignment) data.content = body.assignment;
    if (body.deadline) data.dueAt = new Date(body.deadline);
    if (body.subject) data.title = body.subject;
    if (file) data.file = await uploadToCloudinary(file, 'florieren/assignments');
    
    await this.prisma.assignment.update({ where: { id: BigInt(id) }, data });
    return this.ok(null, 'Assignment updated successfully');
  }

  async deleteAssignment(user: any, id: number) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const assignment = await this.prisma.assignment.findUnique({ where: { id: BigInt(id) } });
    if (!assignment || assignment.staffId !== staff?.id) throw new NotFoundException('Assignment not found');
    await this.prisma.assignment.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Assignment deleted successfully');
  }

  async getLibrary(user: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const items = await this.prisma.libraryResource.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true, subject: true }
    });
    return this.ok(items.map(i => ({ 
      ...i, 
      id: i.id.toString(),
      class: i.classRoom?.name,
      course: i.subject?.name,
      file_url: i.file ? `/uploads/${i.file}` : null,
    })));
  }

  async uploadLibrary(user: any, body: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: body.class, ...(schoolId ? { schoolId } : {}) } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.course, ...(schoolId ? { classRoom: { schoolId } } : {}) } });

    const fileUrl = await uploadToCloudinary(file, 'florieren/library');
    const item = await this.prisma.libraryResource.create({ 
      data: { 
        title: body.course, 
        description: body.about, 
        staffId: staff!.id, 
        classRoomId: classRoom?.id,
        subjectId: subject?.id,
        file: fileUrl, 
        status: 'PENDING'
      } 
    });
    return this.ok({ id: item.id.toString() }, 'Document uploaded successfully');
  }

  async deleteLibrary(user: any, id: number) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const item = await this.prisma.libraryResource.findUnique({ where: { id: BigInt(id) } });
    if (!item) throw new NotFoundException('Document not found');
    if (item.staffId !== staff?.id) throw new ForbiddenException('You can only delete your own documents');
    await this.prisma.libraryResource.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Document deleted successfully');
  }

  async getClasses(user: any) {
    const schoolId = this.schoolId(user);
    return { success: true, data: await this.prisma.classRoom.findMany({ where: { ...(schoolId ? { schoolId } : {}) }, orderBy: { name: 'asc' } }) };
  }

  async getCourses(user: any) {
    const schoolId = this.schoolId(user);
    const courses = await this.prisma.subject.findMany({ where: { ...(schoolId ? { classRoom: { schoolId } } : {}) }, orderBy: { name: 'asc' } });
    return { success: true, data: courses.map(c => ({ course_id: c.id.toString(), course: c.name })) };
  }

  async getSchoolDays() {
    return { success: true, data: await this.prisma.schoolDays.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  async getNotifications(user: any) {
    return { success: true, data: await this.prisma.notification.findMany({ where: { userId: BigInt(user.id) }, orderBy: { createdAt: 'desc' } }) };
  }

  async markNotificationsRead(user: any) {
    await this.prisma.notification.updateMany({ where: { userId: BigInt(user.id), readAt: null }, data: { readAt: new Date() } });
    return { success: true, data: null, message: 'Notifications marked as read' };
  }

  async getClassTimetables(user: any) {
    const schoolId = this.schoolId(user);
    const rows = await this.prisma.classTimetable.findMany({
      where: schoolId ? { classRoom: { schoolId } } : {},
      include: { classRoom: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.ok(rows.map(r => ({ ...r, id: r.id.toString(), classRoomId: r.classRoomId.toString(), classRoom: r.classRoom?.name })));
  }

  async saveClassTimetable(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const { classRoomId, content, id } = body;
    if (!classRoomId || !content) throw new BadRequestException('classRoomId and content are required');
    if (id) {
      await this.prisma.classTimetable.update({ where: { id: BigInt(id) }, data: { content, staffId: staff?.id } });
      return this.ok(null, 'Class timetable updated');
    }
    await this.prisma.classTimetable.create({ data: { classRoomId: BigInt(classRoomId), content, staffId: staff?.id } });
    return this.ok(null, 'Class timetable created');
  }

  async deleteClassTimetable(user: any, id: string) {
    await this.prisma.classTimetable.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Class timetable deleted');
  }

  async getExamTimetables(user: any) {
    const schoolId = this.schoolId(user);
    const rows = await this.prisma.examTimetable.findMany({
      where: schoolId ? { staff: { user: { schoolId } } } : {},
      orderBy: { createdAt: 'desc' },
    });
    return this.ok(rows.map(r => ({ ...r, id: r.id.toString() })));
  }

  async saveExamTimetable(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const { level, content, id } = body;
    if (!level || !content) throw new BadRequestException('level and content are required');
    if (id) {
      await this.prisma.examTimetable.update({ where: { id: BigInt(id) }, data: { content, staffId: staff?.id } });
      return this.ok(null, 'Exam timetable updated');
    }
    await this.prisma.examTimetable.create({ data: { level, content, staffId: staff?.id } });
    return this.ok(null, 'Exam timetable created');
  }

  async deleteExamTimetable(user: any, id: string) {
    await this.prisma.examTimetable.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Exam timetable deleted');
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ where, include: { subject: true } });
    return rows.map(row => ({
      ...row,
      course: row.subject.name,
      testScore: Number(row.testScore),
      examScore: Number(row.examScore),
      totalScore: Number(row.testScore) + Number(row.examScore),
      total_score: Number(row.testScore) + Number(row.examScore),
    }));
  }

  // ── Curriculum ────────────────────────────────────────────────────────────

  async getTopics(user: any, q: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const where: any = { staffId: staff?.id };
    if (q.subjectId) where.subjectId = BigInt(q.subjectId);
    if (q.classRoomId) where.classRoomId = BigInt(q.classRoomId);
    if (q.term) where.term = q.term;
    if (q.session) where.session = q.session;
    const topics = await this.prisma.curriculumTopic.findMany({
      where, orderBy: [{ session: 'desc' }, { term: 'asc' }, { week: 'asc' }],
      include: { subject: true, classRoom: true },
    });
    return this.ok(topics.map(t => ({ ...t, id: t.id.toString(), staffId: t.staffId.toString(), subjectId: t.subjectId?.toString(), classRoomId: t.classRoomId?.toString(), subject: t.subject?.name, classRoom: t.classRoom?.name })));
  }

  async saveTopic(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const data: any = {
      staffId: staff!.id,
      title: body.title,
      description: body.description ?? null,
      week: body.week ? Number(body.week) : null,
      term: body.term ?? null,
      session: body.session ?? null,
      subjectId: this.safeBigInt(body.subjectId),
      classRoomId: this.safeBigInt(body.classRoomId),
    };
    if (body.id) {
      await this.prisma.curriculumTopic.update({ where: { id: BigInt(body.id) }, data });
      return this.ok(null, 'Topic updated');
    }
    const t = await this.prisma.curriculumTopic.create({ data });
    return this.ok({ id: t.id.toString() }, 'Topic created');
  }

  async deleteTopic(user: any, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const topic = await this.prisma.curriculumTopic.findUnique({ where: { id: BigInt(id) } });
    if (!topic || topic.staffId !== staff?.id) throw new NotFoundException('Topic not found');
    await this.prisma.curriculumTopic.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Topic deleted');
  }

  async getLessonPlans(user: any, q: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const where: any = { staffId: staff?.id };
    if (q.topicId) where.topicId = BigInt(q.topicId);
    if (q.subjectId) where.subjectId = BigInt(q.subjectId);
    if (q.classRoomId) where.classRoomId = BigInt(q.classRoomId);
    const plans = await this.prisma.lessonPlan.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { topic: true, subject: true, classRoom: true },
    });
    return this.ok(plans.map(p => ({ ...p, id: p.id.toString(), staffId: p.staffId.toString(), topicId: p.topicId?.toString(), subjectId: p.subjectId?.toString(), classRoomId: p.classRoomId?.toString(), topic: p.topic?.title, subject: p.subject?.name, classRoom: p.classRoom?.name })));
  }

  async saveLessonPlan(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const data: any = {
      staffId: staff!.id,
      title: body.title,
      objectives: body.objectives ?? null,
      content: body.content ?? null,
      resources: body.resources ?? null,
      evaluation: body.evaluation ?? null,
      date: body.date ? new Date(body.date) : null,
      duration: body.duration ? Number(body.duration) : null,
      topicId: this.safeBigInt(body.topicId),
      subjectId: this.safeBigInt(body.subjectId),
      classRoomId: this.safeBigInt(body.classRoomId),
    };
    if (body.id) {
      await this.prisma.lessonPlan.update({ where: { id: BigInt(body.id) }, data });
      return this.ok(null, 'Lesson plan updated');
    }
    const p = await this.prisma.lessonPlan.create({ data });
    return this.ok({ id: p.id.toString() }, 'Lesson plan created');
  }

  async deleteLessonPlan(user: any, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const plan = await this.prisma.lessonPlan.findUnique({ where: { id: BigInt(id) } });
    if (!plan || plan.staffId !== staff?.id) throw new NotFoundException('Lesson plan not found');
    await this.prisma.lessonPlan.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Lesson plan deleted');
  }

  async getWeeklySchemes(user: any, q: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const where: any = { staffId: staff?.id };
    if (q.subjectId) where.subjectId = BigInt(q.subjectId);
    if (q.classRoomId) where.classRoomId = BigInt(q.classRoomId);
    if (q.term) where.term = q.term;
    if (q.session) where.session = q.session;
    const schemes = await this.prisma.weeklyScheme.findMany({
      where, orderBy: [{ session: 'desc' }, { term: 'asc' }, { week: 'asc' }],
      include: { subject: true, classRoom: true },
    });
    return this.ok(schemes.map(s => ({ ...s, id: s.id.toString(), staffId: s.staffId.toString(), subjectId: s.subjectId?.toString(), classRoomId: s.classRoomId?.toString(), subject: s.subject?.name, classRoom: s.classRoom?.name })));
  }

  async saveWeeklyScheme(user: any, body: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const data: any = {
      staffId: staff!.id,
      week: Number(body.week),
      term: body.term,
      session: body.session,
      content: body.content,
      subjectId: this.safeBigInt(body.subjectId),
      classRoomId: this.safeBigInt(body.classRoomId),
    };
    if (body.id) {
      await this.prisma.weeklyScheme.update({ where: { id: BigInt(body.id) }, data });
      return this.ok(null, 'Weekly scheme updated');
    }
    const s = await this.prisma.weeklyScheme.create({ data });
    return this.ok({ id: s.id.toString() }, 'Weekly scheme created');
  }

  async deleteWeeklyScheme(user: any, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: this.userId(user) } });
    const scheme = await this.prisma.weeklyScheme.findUnique({ where: { id: BigInt(id) } });
    if (!scheme || scheme.staffId !== staff?.id) throw new NotFoundException('Weekly scheme not found');
    await this.prisma.weeklyScheme.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Weekly scheme deleted');
  }
}
