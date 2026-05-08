import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private async getCurrentSession(): Promise<string> {
    const r = await this.prisma.academicSession.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async getCurrentTerm(): Promise<string> {
    const r = await this.prisma.academicTerm.findFirst({ orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  async dashboard(user: any) {
    const session = await this.getCurrentSession();
    const term = await this.getCurrentTerm();
    
    // Find staff record to get the classroom relation
    const staff = await this.prisma.staff.findUnique({ 
      where: { userId: BigInt(user.id) },
      include: { classRooms: true }
    });

    const studentCount = await this.prisma.user.count({ 
      where: { role: 'STUDENT', student: { classRoomId: staff?.classRooms[0]?.id } } 
    });

    const assignments = await this.prisma.assignment.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' } 
    });

    const libraryItems = await this.prisma.libraryResource.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' } 
    });

    return this.ok({ 
      user, 
      current_session: session, 
      current_term: term, 
      student_count: studentCount, 
      analytics: { 
        assignments: { 
          total: assignments.length, 
          recent: assignments.slice(0, 5) 
        }, 
        library: { 
          total: libraryItems.length, 
          verified: libraryItems.filter((i: any) => i.status == 'APPROVED').length, 
          pending: libraryItems.filter((i: any) => i.status == 'PENDING').length 
        } 
      } 
    });
  }

  async profile(user: any) {
    const profile = await this.prisma.user.findUnique({ 
      where: { id: user.id },
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
        where: { id: user.id }, 
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
    await this.prisma.user.update({ where: { id: user.id }, data: { image: file.filename } });
    return this.ok({ image: file.filename }, 'Image updated successfully');
  }

  async getStudents(user: any, cls?: string) {
    const where: any = { role: 'STUDENT', status: 'ACTIVE' };
    if (cls) {
      where.student = { classRoom: { name: cls } };
    } else {
      // Get staff's classroom
      const staff = await this.prisma.staff.findUnique({ where: { userId: BigInt(user.id) }, include: { classRooms: true } });
      if (staff?.classRooms?.length) where.student = { classRoomId: staff.classRooms[0].id };
    }
    
    const students = await this.prisma.user.findMany({ 
      where,
      include: { student: { include: { classRoom: true } } }
    });
    return this.ok(students);
  }

  async getStudentDetails(id: string) {
    const student = await this.prisma.user.findUnique({ 
      where: { uniqueId: id },
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

    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.course } });

    if (!sessionEntity || !termEntity || !staff || !subject) {
      throw new BadRequestException('Session, Term, Staff, or Subject not found');
    }

    if (Array.isArray(body.results)) {
      let count = 0;
      for (const r of body.results) {
        if (!r.student_id) continue;
        const student = await this.prisma.student.findUnique({ where: { studentNo: r.student_id } });
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
      const student = await this.prisma.student.findUnique({ where: { studentNo: q.student_id } });
      const results = await this.resultsWithTotals({ 
        studentId: student?.id, 
        sessionId: sessionEntity?.id, 
        termId: termEntity?.id 
      });
      return this.ok({ results });
    }

    const cls = q.class || user.class;
    const students = await this.prisma.user.findMany({ 
      where: { role: 'STUDENT', student: { classRoom: { name: cls } } },
      include: { student: true }
    });
    
    const studentIds = students.map(s => s.student?.id).filter(Boolean) as bigint[];
    const results = await this.prisma.result.findMany({
      where: {
        sessionId: sessionEntity?.id,
        termId: termEntity?.id,
        studentId: { in: studentIds },
        ...(q.course ? { subject: { name: q.course } } : {}),
      },
      include: { student: { include: { user: true } }, subject: true }
    });

    const data = results.map(r => ({
      ...r,
      student_id: r.student.studentNo,
      firstname: r.student.user.firstName,
      lastname: r.student.user.lastName,
      course: r.subject.name,
      test_score: r.testScore,
      exam_score: r.examScore,
      total_score: Number(r.testScore || 0) + Number(r.examScore || 0),
    }));

    return this.ok(data);
  }

  async deleteResult(body: any) {
    const { course, session, term, student_ids } = body;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term as any, sessionId: sessionEntity?.id } });
    const subject = await this.prisma.subject.findFirst({ where: { name: course } });

    if (!Array.isArray(student_ids)) throw new BadRequestException('student_ids must be an array');
    
    let count = 0;
    for (const id of student_ids) {
      const student = await this.prisma.student.findUnique({ where: { studentNo: id } });
      if (!student) continue;
      
      const affected = await this.prisma.result.deleteMany({ 
        where: { studentId: student.id, subjectId: subject?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      if (affected.count) count++;
    }
    return this.ok({ count }, `Successfully deleted ${count} result(s)`);
  }

  async getAttendance(q: any) {
    const session = q.session || await this.getCurrentSession();
    const term = q.term || await this.getCurrentTerm();
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ 
      where: { name: term as any, sessionId: sessionEntity?.id } 
    });

    if (q.student_id) {
      const student = await this.prisma.student.findUnique({ where: { studentNo: q.student_id } });
      const att = await this.prisma.attendance.findFirst({ 
        where: { studentId: student?.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
      });
      return this.ok(att);
    }
    
    if (q.class) {
      const students = await this.prisma.user.findMany({ 
        where: { role: 'STUDENT', student: { classRoom: { name: q.class } } },
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

  async updateAttendance(body: any) {
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
        await this.upsertAttendance(s.student_id, s.present || 0, s.absent || 0, sessionEntity.id, termEntity.id);
        count++;
      }
      return this.ok({ count }, `Saved attendance for ${count} student(s)`);
    }

    await this.upsertAttendance(body.student_id, body.present, body.absent, sessionEntity.id, termEntity.id);
    return this.ok(null, 'Attendance updated successfully');
  }

  private async upsertAttendance(studentNo: string, present: number, absent: number, sessionId: bigint, termId: bigint) {
    const student = await this.prisma.student.findUnique({ where: { studentNo } });
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

  async addComment(body: any) {
    const { student_id, comment, session, term } = body;
    if (!student_id || !comment || !session || !term) throw new BadRequestException('All fields required');
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: { name: session } });
    const termEntity = await this.prisma.academicTerm.findFirst({ where: { name: term as any, sessionId: sessionEntity?.id } });
    const student = await this.prisma.student.findUnique({ where: { studentNo: student_id } });

    if (!sessionEntity || !termEntity || !student) throw new BadRequestException('Session, Term, or Student not found');

    await this.prisma.attendance.upsert({
      where: {
        studentId_sessionId_termId: {
          studentId: student.id,
          sessionId: sessionEntity.id,
          termId: termEntity.id,
        }
      },
      update: { comment },
      create: {
        studentId: student.id,
        sessionId: sessionEntity.id,
        termId: termEntity.id,
        comment,
      }
    });
    return this.ok(null, 'Comment added successfully');
  }

  async createAssignment(user: any, body: any, file?: Express.Multer.File) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: body.class } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.subject } });

    const assignment = await this.prisma.assignment.create({ 
      data: { 
        title: body.subject || 'Assignment', 
        content: body.assignment, 
        dueAt: body.deadline ? new Date(body.deadline) : null, 
        staffId: staff!.id, 
        classRoomId: classRoom?.id,
        subjectId: subject?.id,
        file: file?.filename 
      } 
    });
    return this.ok({ id: assignment.id.toString() }, 'Assignment created successfully');
  }

  async getAssignments(user: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const assignments = await this.prisma.assignment.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true }
    });
    return this.ok(assignments.map(a => ({ ...a, class: a.classRoom?.name })));
  }

  async updateAssignment(user: any, id: number, body: any, file?: Express.Multer.File) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const assignment = await this.prisma.assignment.findUnique({ where: { id: BigInt(id) } });
    if (!assignment || assignment.staffId !== staff?.id) throw new NotFoundException('Assignment not found');
    
    const data: any = {};
    if (body.assignment) data.content = body.assignment;
    if (body.deadline) data.dueAt = new Date(body.deadline);
    if (body.subject) data.title = body.subject;
    if (file) data.file = file.filename;
    
    await this.prisma.assignment.update({ where: { id: BigInt(id) }, data });
    return this.ok(null, 'Assignment updated successfully');
  }

  async deleteAssignment(user: any, id: number) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const assignment = await this.prisma.assignment.findUnique({ where: { id: BigInt(id) } });
    if (!assignment || assignment.staffId !== staff?.id) throw new NotFoundException('Assignment not found');
    await this.prisma.assignment.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Assignment deleted successfully');
  }

  async getLibrary(user: any) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const items = await this.prisma.libraryResource.findMany({ 
      where: { staffId: staff?.id }, 
      orderBy: { createdAt: 'desc' },
      include: { classRoom: true, subject: true }
    });
    return this.ok(items.map(i => ({ 
      ...i, 
      id: i.id.toString(),
      class: i.classRoom?.name,
      course: i.subject?.name 
    })));
  }

  async uploadLibrary(user: any, body: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: body.class } });
    const subject = await this.prisma.subject.findFirst({ where: { name: body.course } });

    const item = await this.prisma.libraryResource.create({ 
      data: { 
        title: body.course, 
        description: body.about, 
        staffId: staff!.id, 
        classRoomId: classRoom?.id,
        subjectId: subject?.id,
        file: file.filename, 
        status: 'PENDING'
      } 
    });
    return this.ok({ id: item.id.toString() }, 'Document uploaded successfully');
  }

  async deleteLibrary(user: any, id: number) {
    const staff = await this.prisma.staff.findUnique({ where: { userId: user.id } });
    const item = await this.prisma.libraryResource.findUnique({ where: { id: BigInt(id) } });
    if (!item) throw new NotFoundException('Document not found');
    if (item.staffId !== staff?.id) throw new ForbiddenException('You can only delete your own documents');
    await this.prisma.libraryResource.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Document deleted successfully');
  }

  async getClasses() {
    return { success: true, data: await this.prisma.classRoom.findMany({ orderBy: { name: 'asc' } }) };
  }

  async getCourses() {
    const courses = await this.prisma.subject.findMany({ orderBy: { name: 'asc' } });
    return { success: true, data: courses.map(c => ({ course_id: c.id.toString(), course: c.name })) };
  }

  async getSchoolDays() {
    return { success: true, data: await this.prisma.schoolDays.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ where });
    return rows.map(row => ({
      ...row,
      testScore: Number(row.testScore),
      examScore: Number(row.examScore),
      total_score: (Number(row.testScore) || 0) + (Number(row.examScore) || 0),
    }));
  }
}
