import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../common/email.service';
import { SmsService } from '../common/sms.service';
import { NotificationService } from '../common/notification.service';
import { uploadToCloudinary } from '../common/cloudinary';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private emailService: EmailService, private smsService: SmsService, private notificationService: NotificationService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  private normalizeWebsiteUrl(website?: string | null): string | undefined {
    const trimmed = website?.trim();
    if (!trimmed) return undefined;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  async dashboard(user: any) {
    const schoolId = this.schoolId(user);
    let effectiveSchoolId = schoolId;
    if (!effectiveSchoolId) {
      const managedSchool = await this.findManagedSchool(user);
      effectiveSchoolId = BigInt(managedSchool.id);
    }
    const schoolWhere = { schoolId: effectiveSchoolId };
    const [totalStudents, activeStudents, pendingStudents, totalStaff, activeStaff, session, term, recentUsers, recentPayments, grouped] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT', ...schoolWhere } }),
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE', ...schoolWhere } }),
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'PENDING', ...schoolWhere } }),
      this.prisma.user.count({ where: { role: 'STAFF', ...schoolWhere } }),
      this.prisma.user.count({ where: { role: 'STAFF', status: 'ACTIVE', ...schoolWhere } }),
      this.prisma.academicSession.findFirst({ where: { isCurrent: true, ...schoolWhere } }),
      this.prisma.academicTerm.findFirst({ where: { isCurrent: true, schoolId: effectiveSchoolId } }),
      this.prisma.user.findMany({ where: { role: 'STUDENT', ...schoolWhere }, orderBy: { createdAt: 'desc' }, take: 3, select: { firstName: true, lastName: true, createdAt: true } }),
      this.prisma.schoolFeePayment.findMany({ where: { student: { user: { schoolId: effectiveSchoolId } } }, orderBy: { createdAt: 'desc' }, take: 3, include: { student: { include: { user: true } } } }),
      this.prisma.student.groupBy({ by: ['classRoomId'], where: { user: { schoolId: effectiveSchoolId } }, _count: { _all: true } }),
    ]);

    const classRooms = await this.prisma.classRoom.findMany({ where: schoolWhere });
    const classMap = new Map(classRooms.map(c => [c.id.toString(), c.name]));
    
    const studentsByClass = grouped.map((row: any) => ({ 
      class: row.classRoomId ? classMap.get(row.classRoomId.toString()) : 'Unknown', 
      count: row._count?._all ?? 0 
    }));

    return this.ok({
      students: { total: totalStudents, verified: activeStudents, pending: pendingStudents },
      staff: { total: totalStaff, verified: activeStaff },
      studentsByClass,
      current_session: session?.name,
      current_term: term?.name,
      recentStudents: recentUsers.map(u => ({ firstname: u.firstName, lastname: u.lastName, date: u.createdAt })),
      recentPayments: recentPayments.map(p => ({ student_id: p.student.user.uniqueId, date: p.createdAt })),
    });
  }

  async getSchool(user: any) {
    const school = await this.findManagedSchool(user);
    return this.ok(this.serializeSchool(school));
  }

  async updateSchool(user: any, data: any) {
    const school = await this.findManagedSchool(user);
    const update = this.pick(data, [
      'name',
      'slug',
      'slogan',
      'motto',
      'description',
      'email',
      'contactEmail',
      'contactName',
      'telephone',
      'alternatePhone',
      'address',
      'city',
      'state',
      'country',
      'website',
      'logo',
      'primaryColor',
      'secondaryColor',
      'accentColor',
    ]);

    const updated = await this.prisma.school.update({
      where: { id: school.id },
      data: update,
    });

    return this.ok(this.serializeSchool(updated), 'School information updated successfully');
  }

  async uploadLogo(user: any, logo: Express.Multer.File) {
    if (!logo) throw new BadRequestException('No file uploaded');
    if (!logo.mimetype?.startsWith('image/')) throw new BadRequestException('Logo must be an image');

    const school = await this.findManagedSchool(user);
    const logoUrl = await uploadToCloudinary(logo, 'florieren/schools');

    const updated = await this.prisma.school.update({
      where: { id: school.id },
      data: { logo: logoUrl },
    });

    return this.ok(this.serializeSchool(updated), 'Logo uploaded successfully');
  }

  async getStudents(user: any, q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const where: any = { role: 'STUDENT' };
    const schoolId = this.schoolId(user);
    if (schoolId) where.schoolId = schoolId;
    
    if (q.class) {
      where.student = { classRoom: { name: q.class, ...(schoolId ? { schoolId } : {}) } };
    }
    
    if (q.status === '1') where.status = 'ACTIVE';
    else if (q.status === '0') where.status = 'PENDING';
    
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { uniqueId: { contains: q.search } },
        { email: { contains: q.search } },
      ];
    }

    const [total, students] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: perPage,
        skip: (page - 1) * perPage,
        include: { student: { include: { classRoom: true } } },
      }),
    ]);

    const data = students.map(s => ({
      student_id: s.uniqueId,
      firstname: s.firstName,
      lastname: s.lastName,
      email: s.email,
      class: s.student?.classRoom?.name || '',
      image: s.image,
      admin_verify: s.status === 'ACTIVE' ? '1' : '0',
    }));

    return { success: true, data, meta: { total, page, per_page: perPage, last_page: Math.ceil(total / perPage) } };
  }

  async createStudent(user: any, data: any) {
    const schoolId = this.schoolId(user);
    const studentId = await this.generateStudentId(schoolId);
    const classRoom = await this.prisma.classRoom.findFirst({ where: { name: data.class, ...(schoolId ? { schoolId } : {}) } });
    const school = schoolId ? await this.prisma.school.findUnique({ where: { id: schoolId }, select: { website: true } }) : null;
    const firstName = data.firstName || data.firstname || '';
    const lastName = data.lastName || data.lastname || '';
    
    await this.prisma.user.create({ 
      data: {
        uniqueId: studentId,
        schoolId,
        role: 'STUDENT',
        firstName,
        lastName,
        email: data.email || '',
        telephone: data.telephone || '',
        password: await bcrypt.hash(data.password || 'greatkings', 10),
        image: 'image.png',
        status: 'ACTIVE',
        student: {
          create: {
            studentNo: studentId,
            classRoomId: classRoom?.id,
          } as any
        }
      }
    });
    this.emailService.sendStudentCreated({
      firstName,
      lastName,
      email: data.email || '',
      uniqueId: studentId,
      password: data.password || 'greatkings',
      website: this.normalizeWebsiteUrl(school?.website),
    });
    return this.ok({ student_id: studentId }, 'Student created successfully');
  }

  async updateStudent(studentId: string, data: any) {
    const user = await this.prisma.user.findFirst({ where: { uniqueId: studentId } });
    if (!user) throw new NotFoundException('Student not found');
    
    const userUpdate = this.pick(data, ['firstName', 'lastName', 'email', 'telephone']);
    const studentUpdate = this.pick(data, ['dateOfBirth', 'stateOfOrigin', 'homeAddress', 'fatherName', 'motherName']);
    
    if (data.class) {
      const classRoom = await this.prisma.classRoom.findFirst({ where: { name: data.class } });
      if (classRoom) studentUpdate.classRoomId = classRoom.id;
    }

    await this.prisma.user.update({
      where: { uniqueId: studentId },
      data: {
        ...userUpdate,
        student: { update: studentUpdate }
      }
    });
    return this.ok(null, 'Student updated successfully');
  }

  async verifyStudent(studentId: string) {
    const user = await this.prisma.user.update({ 
      where: { uniqueId: studentId }, 
      data: { status: 'ACTIVE' } 
    });
    
    await this.notificationService.notify(
      user.id,
      'Account Verified',
      'Your account has been verified. You can now access all features.',
    );
    return this.ok(null, 'Student verified successfully');
  }

  async unverifyStudent(studentId: string) {
    const user = await this.prisma.user.update({ 
      where: { uniqueId: studentId }, 
      data: { status: 'PENDING' } 
    });
    
    await this.notificationService.notify(
      user.id,
      'Account Unverified',
      'Your account has been unverified. You can no longer access all features.',
    );
    return this.ok(null, 'Student unverified successfully');
  }

  async bulkVerifyStudents(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No students selected');
    for (const id of ids) await this.verifyStudent(id);
    return this.ok({ count: ids.length }, `${ids.length} student(s) verified successfully`);
  }

  async deleteStudent(studentId: string) {
    const user = await this.prisma.user.findUnique({ where: { uniqueId: studentId } });
    if (!user) throw new NotFoundException('Student not found');
    await this.prisma.user.delete({ where: { id: user.id } });
    return this.ok(null, 'Student deleted successfully');
  }

  async getStaff(user: any, q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const where: any = { role: { in: ['STAFF', 'ADMIN'] } };
    const schoolId = this.schoolId(user);
    if (schoolId) where.schoolId = schoolId;
    
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { uniqueId: { contains: q.search } },
        { email: { contains: q.search } },
      ];
    }

    const [total, staff] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ 
        where, 
        orderBy: { createdAt: 'desc' }, 
        take: perPage, 
        skip: (page - 1) * perPage,
        include: { staff: true }
      }),
    ]);

    const data = staff.map(s => ({
      staff_id: s.id.toString(),
      unique_id: s.uniqueId,
      firstname: s.firstName,
      lastname: s.lastName,
      email: s.email,
      telephone: s.telephone,
      image: s.image,
      admin_verify: s.status === 'ACTIVE' ? '1' : '0',
      role: s.staff?.staffRole ?? null,
      staffNo: s.staff?.staffNo ?? null,
    }));

    return { success: true, data, meta: { total, page, per_page: perPage } };
  }

  async createStaff(user: any, data: any) {
    const schoolId = this.schoolId(user);
    const uniqueId = await this.generateStaffId(schoolId);
    const school = schoolId ? await this.prisma.school.findUnique({ where: { id: schoolId }, select: { website: true } }) : null;
    await this.prisma.user.create({ 
      data: {
        uniqueId: uniqueId,
        schoolId,
        role: (data.role?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'STAFF') as any,
        firstName: data.firstname || '',
        lastName: data.lastname || '',
        email: data.email || '',
        telephone: data.telephone || '',
        password: await bcrypt.hash(data.password || 'greatkings', 10),
        image: 'image.png',
        status: 'ACTIVE',
        staff: {
          create: {
            staffNo: uniqueId,
            staffRole: data.role && data.role.toUpperCase() !== 'ADMIN' ? data.role.toLowerCase() : null,
          }
        }
      }
    });
    this.emailService.sendStaffCreated({
      firstName: data.firstname || '',
      lastName: data.lastname || '',
      email: data.email || '',
      uniqueId,
      password: data.password || 'greatkings',
      website: this.normalizeWebsiteUrl(school?.website),
    });
    return this.ok({ unique_id: uniqueId }, 'Staff created successfully');
  }

  async updateStaff(staffId: string, data: any) {
    const userUpdate = this.pick(data, ['firstName', 'lastName', 'email', 'telephone']);
    if (Object.keys(userUpdate).length) {
      const result = await this.prisma.user.updateMany({ where: { id: BigInt(staffId) }, data: userUpdate });
      if (result.count === 0) throw new NotFoundException('Staff not found');
    }
    if (data.role !== undefined) {
      await this.prisma.staff.updateMany({
        where: { userId: BigInt(staffId) },
        data: { staffRole: data.role || null },
      });
    }
    return this.ok(null, 'Staff updated successfully');
  }

  async verifyStaff(staffId: string) {
    await this.prisma.user.update({ where: { id: BigInt(staffId) }, data: { status: 'ACTIVE' } });
    return this.ok(null, 'Staff verified successfully');
  }

  async deleteStaff(staffId: string) {
    await this.prisma.user.delete({ where: { id: BigInt(staffId) } });
    return this.ok(null, 'Staff deleted successfully');
  }

  async getSessions(user: any) {
    const schoolId = this.schoolId(user);
    const where = schoolId ? { schoolId } : {};
    const [sessions, current] = await Promise.all([
      this.prisma.academicSession.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.prisma.academicSession.findFirst({ where, orderBy: { createdAt: 'desc' } }),
    ]);
    return this.ok(sessions.map(s => ({ ...s, id: s.id.toString(), session: s.name, current: s.id === current?.id })));
  }

  async createSession(user: any, name: string) {
    if (!name) throw new BadRequestException('Session name is required');
    const schoolId = this.schoolId(user);
    const existing = await this.prisma.academicSession.findFirst({ where: { name, ...(schoolId ? { schoolId } : {}) } });
    if (existing) throw new BadRequestException('Session already exists');
    await this.prisma.academicSession.create({ data: { name, schoolId } });
    return this.ok(null, 'Session created successfully');
  }

  async setCurrentSession(user: any, name: string) {
    const schoolId = this.schoolId(user);
    const where = schoolId ? { schoolId } : {};
    await this.prisma.academicSession.updateMany({ where, data: { isCurrent: false } });
    const nameWhere = schoolId ? { schoolId, name } : { name };
    await this.prisma.academicSession.updateMany({ where: nameWhere, data: { isCurrent: true } });
    return this.ok(null, 'Current session updated successfully');
  }

  async deleteTerm(user: any, id: string) {
    const schoolId = this.schoolId(user);
    const where: any = { id: BigInt(id) };
    if (schoolId) where.schoolId = schoolId;
    await this.prisma.academicTerm.delete({ where });
    return this.ok(null, 'Term deleted successfully');
  }

  async updateTerm(user: any, id: string, data: { name?: string }) {
    const schoolId = this.schoolId(user);
    const where: any = { id: BigInt(id) };
    if (schoolId) where.schoolId = schoolId;
    await this.prisma.academicTerm.update({ where, data: { ...(data.name && { name: data.name as any }) } });
    return this.ok(null, 'Term updated successfully');
  }

  async createTerm(user: any, sessionName: string, name: string) {
    if (!sessionName) throw new BadRequestException('Session is required');
    if (!name) throw new BadRequestException('Term name is required');
    const schoolId = this.schoolId(user);
    const sessionWhere: any = { name: sessionName };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const session = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    if (!session) throw new NotFoundException('Session not found');
    try {
      await this.prisma.academicTerm.create({ data: { name: name as any, sessionId: session.id, schoolId } });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Term already exists for this session');
      throw e;
    }
    return this.ok(null, 'Term created successfully');
  }

  async deleteSession(user: any, name: string) {
    const schoolId = this.schoolId(user);
    const where: any = { name };
    if (schoolId) where.schoolId = schoolId;
    await this.prisma.academicSession.deleteMany({ where });
    return this.ok(null, 'Session deleted successfully');
  }

  async getTerms(user: any) {
    const schoolId = this.schoolId(user);
    const where = schoolId ? { schoolId } : {};
    const terms = await this.prisma.academicTerm.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { session: true },
    });
    return this.ok(terms.map(t => ({ ...t, id: t.id.toString(), term: t.name, sessionName: t.session?.name })));
  }

  async setCurrentTerm(termId: string) {
    const term = await this.prisma.academicTerm.findUnique({ where: { id: BigInt(termId) } });
    if (!term) throw new BadRequestException('Term not found');
    await this.prisma.academicTerm.updateMany({ where: { sessionId: term.sessionId }, data: { isCurrent: false } });
    await this.prisma.academicTerm.update({ where: { id: BigInt(termId) }, data: { isCurrent: true } });
    return this.ok(null, 'Current term updated successfully');
  }

  async getAllPayments(user: any, q: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const limit = parseInt(q.limit) || 20;
    const where: any = {};
    const schoolId = this.schoolId(user);
    if (schoolId) where.student = { user: { schoolId } };
    if (q.status) where.status = q.status;
    if (q.session) {
      const session = await this.prisma.academicSession.findFirst({ where: { name: q.session } });
      if (session) where.sessionId = session.id;
    }
    if (q.term) {
      const term = await this.prisma.academicTerm.findFirst({ where: { name: q.term as any } });
      if (term) where.termId = term.id;
    }
    if (q.class) {
      const classRoom = await this.prisma.classRoom.findFirst({ where: { name: q.class, ...(schoolId ? { schoolId } : {}) } });
      if (classRoom) where.student = { ...(where.student ?? {}), classRoomId: classRoom.id };
    }
    const [total, payments] = await Promise.all([
      this.prisma.schoolFeePayment.count({ where }),
      this.prisma.schoolFeePayment.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: { student: { include: { user: true } } },
      }),
    ]);
    return { success: true, data: payments.map(p => ({
      ...p, id: p.id.toString(),
      student_id: p.student.user.uniqueId,
      firstname: p.student.user.firstName,
      lastname: p.student.user.lastName,
    })), meta: { total, page, per_page: limit, last_page: Math.ceil(total / limit) } };
  }

  async getPendingPayments(user: any) {
    const schoolId = this.schoolId(user);
    const payments = await this.prisma.schoolFeePayment.findMany({
      where: { status: 'PENDING', ...(schoolId ? { student: { user: { schoolId } } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { student: { include: { user: true } } }
    });
    return this.ok(payments.map(p => ({
      ...p,
      id: p.id.toString(),
      student_id: p.student.user.uniqueId,
      firstname: p.student.user.firstName,
      lastname: p.student.user.lastName,
    })));
  }

  async verifyPayment(id: string) {
    await this.prisma.schoolFeePayment.update({
      where: { id: BigInt(id) },
      data: { status: 'SUCCESS', paidAt: new Date() }
    });
    return this.ok(null, 'Payment verified successfully');
  }

  async getLibrary(user: any) {
    const schoolId = this.schoolId(user);
    const library = await this.prisma.libraryResource.findMany({ 
      where: schoolId ? { staff: { user: { schoolId } } } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { staff: { include: { user: true } } }
    });
    return this.ok(library.map(l => ({
      ...l,
      id: l.id.toString(),
      firstname: l.staff?.user.firstName,
      lastname: l.staff?.user.lastName,
    })));
  }

  async approveLibrary(id: string) {
    await this.prisma.libraryResource.update({
      where: { id: BigInt(id) },
      data: { status: 'APPROVED' }
    });
    return this.ok(null, 'Book approved successfully');
  }

  async deleteLibrary(id: string) {
    await this.prisma.libraryResource.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Book deleted successfully');
  }

  async getClasses(user: any) {
    const schoolId = this.schoolId(user);
    const classes = await this.prisma.classRoom.findMany({ 
      where: { ...(schoolId ? { schoolId } : {}) },
      orderBy: { name: 'asc' },
      include: { 
        classTeacher: { include: { user: true } },
        _count: { select: { students: true } }
      }
    });
    return this.ok(classes.map(c => ({
      ...c,
      id: c.id.toString(),
      class: c.name,
      teacher_name: c.classTeacher ? `${c.classTeacher.user.firstName} ${c.classTeacher.user.lastName}` : null,
      student_count: c._count.students,
    })));
  }

  async createClass(user: any, data: any) {
    const schoolId = this.schoolId(user);
    const where: any = { name: data.name };
    if (schoolId) {
      where.schoolId = schoolId;
    }
    const existing = await this.prisma.classRoom.findFirst({ where });
    if (existing) {
      throw new BadRequestException('Class already exists');
    }
    const teacher = await this.prisma.staff.findFirst({ where: { staffNo: data.class_teacher, ...(schoolId ? { user: { schoolId } } : {}) } });
    await this.prisma.classRoom.create({ 
      data: { 
        schoolId,
        name: data.name, 
        classTeacherId: teacher?.id 
      } 
    });
    return this.ok(null, 'Class created successfully');
  }

  async updateClass(user: any, oldName: string, data: any) {
    const schoolId = this.schoolId(user);
    const teacher = await this.prisma.staff.findFirst({ where: { staffNo: data.class_teacher } });
    await this.prisma.classRoom.update({ 
      where: { name: oldName, ...(schoolId ? { schoolId } : {}) }, 
      data: { 
        name: data.name, 
        classTeacherId: teacher?.id 
      } 
    });
    return this.ok(null, 'Class updated successfully');
  }

  async deleteClass(name: string) {
    await this.prisma.classRoom.delete({ where: { name } });
    return this.ok(null, 'Class deleted successfully');
  }

  async getCourses(user: any) {
    const schoolId = this.schoolId(user);
    const subjects = await this.prisma.subject.findMany({ 
      where: schoolId ? { classRoom: { schoolId } } : {},
      orderBy: { name: 'asc' },
      include: { teacher: { include: { user: true } } }
    });
    return this.ok(subjects.map(s => ({ 
      course_id: s.id.toString(), 
      course: s.name, 
      teacher: s.teacher ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}` : '' 
    })));
  }

  async createCourse(data: any) {
    await this.prisma.subject.create({ data: { name: data.course } });
    return this.ok(null, 'Course created successfully');
  }

  async updateCourse(oldName: string, data: any) {
    await this.prisma.subject.updateMany({ where: { name: oldName }, data: { name: data.course } });
    return this.ok(null, 'Course updated successfully');
  }

  async deleteCourse(name: string) {
    await this.prisma.subject.deleteMany({ where: { name } });
    return this.ok(null, 'Course deleted successfully');
  }

  async getResults(user: any, q: any) {
    const schoolId = this.schoolId(user);
    const session = q.session || await this.getCurrentSession(user);
    const term = q.term || await this.getCurrentTerm(user);
    
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const termWhere: any = { name: term as any, sessionId: undefined };
    
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    if (sessionEntity) termWhere.sessionId = sessionEntity.id;
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    const sessionListWhere = schoolId ? { schoolId } : {};
    const classWhere = schoolId ? { schoolId } : {};
    const [classes, sessions] = await Promise.all([
      this.prisma.classRoom.findMany({ where: classWhere, orderBy: { name: 'asc' } }),
      this.prisma.academicSession.findMany({ where: sessionListWhere, orderBy: { name: 'desc' } }),
    ]);

    if (!sessionEntity || !termEntity) {
      return this.ok({
        students: [],
        classes: classes.map(c => ({ id: c.id.toString(), class: c.name })),
        sessions: sessions.map(s => ({ id: s.id.toString(), session: s.name, current: s.id === sessionEntity?.id })),
        current_session: session,
        current_term: term,
      });
    }

    const where: any = { sessionId: sessionEntity.id, termId: termEntity.id };
    const userWhere: any = { role: 'STUDENT', schoolId };
    if (q.class) {
      userWhere.student = { classRoom: { name: q.class } };
    }

    const [resultRows, users, allClasses, allSessions] = await Promise.all([
      this.prisma.result.findMany({ where }),
      this.prisma.user.findMany({ 
        where: userWhere, 
        select: { uniqueId: true, firstName: true, lastName: true, image: true, student: { include: { classRoom: true } } } 
      }),
      this.prisma.classRoom.findMany({ where: classWhere, orderBy: { name: 'asc' } }),
      this.prisma.academicSession.findMany({ where: sessionListWhere, orderBy: { name: 'desc' } }),
    ]);

    const byStudent = new Map(users.map(u => [u.uniqueId, u]));
    const grouped = new Map<string, any[]>();
    for (const row of resultRows) {
      const student = users.find(u => u.student?.id === row.studentId);
      if (!student) continue;
      grouped.set(student.uniqueId, [...(grouped.get(student.uniqueId) ?? []), row]);
    }

    const students = [...grouped.entries()].map(([uniqueId, rows]) => {
      const user = byStudent.get(uniqueId);
      const totals = rows.map(r => Number(r.testScore) + Number(r.examScore));
      return {
        student_id: uniqueId,
        firstname: user?.firstName,
        lastname: user?.lastName,
        class: user?.student?.classRoom?.name,
        image: user?.image,
        subject_count: rows.length,
        average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0,
        approved: rows[0]?.approvedAt ? '1' : '0',
      };
    }).sort((a, b) => `${a.class}${a.firstname}`.localeCompare(`${b.class}${b.firstname}`));

    return this.ok({
      students,
      classes: allClasses.map((c: any) => ({ id: c.id.toString(), class: c.name })),
      sessions: allSessions.map((s: any) => ({ id: s.id.toString(), session: s.name, current: s.id === sessionEntity.id })),
      current_session: session,
      current_term: term,
    });
  }

  async getStudentResults(currentUser: any, studentId: string, q: any) {
    const schoolId = this.schoolId(currentUser);
    const session = q.session || await this.getCurrentSession(currentUser);
    const term = q.term || await this.getCurrentTerm(currentUser);
    
    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = schoolId;
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const user = await this.prisma.user.findUnique({
      where: { uniqueId: studentId, ...(schoolId ? { schoolId } : {}) },
      include: { student: { include: { classRoom: true } } },
    });

    if (!user || !user.student || !sessionEntity || !termEntity) throw new NotFoundException('Student or Session/Term not found');

    const termUpper = term.toUpperCase();
    const needFirst = termUpper === 'SECOND' || termUpper === 'THIRD';
    const needSecond = termUpper === 'THIRD';

    const [firstTerm, secondTerm] = await Promise.all([
      needFirst
        ? this.prisma.academicTerm.findFirst({ where: { name: 'FIRST', sessionId: sessionEntity.id, ...(schoolId ? { schoolId: BigInt(schoolId) } : {}) } })
        : Promise.resolve(null),
      needSecond
        ? this.prisma.academicTerm.findFirst({ where: { name: 'SECOND', sessionId: sessionEntity.id, ...(schoolId ? { schoolId: BigInt(schoolId) } : {}) } })
        : Promise.resolve(null),
    ]);

    const [results, firstResults, secondResults, attendance, trait, principal, classWithTeacher] = await Promise.all([
      this.resultsWithTotals({ studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id }),
      needFirst && firstTerm
        ? this.resultsWithTotals({ studentId: user.student.id, sessionId: sessionEntity.id, termId: firstTerm.id })
        : Promise.resolve([]),
      needSecond && secondTerm
        ? this.resultsWithTotals({ studentId: user.student.id, sessionId: sessionEntity.id, termId: secondTerm.id })
        : Promise.resolve([]),
      this.prisma.attendance.findFirst({ where: { studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id } }),
      this.prisma.studentTrait.findFirst({ where: { studentId: user.student.id, sessionId: sessionEntity.id, termId: termEntity.id } }),
      this.prisma.user.findFirst({ where: { role: 'ADMIN', ...(schoolId ? { schoolId } : {}) }, select: { firstName: true, lastName: true, image: true } }),
      user.student.classRoomId
        ? this.prisma.classRoom.findUnique({ where: { id: user.student.classRoomId }, include: { classTeacher: { include: { user: true } } } })
        : Promise.resolve(null),
    ]);

    const firstBySubject = new Map(firstResults.map(r => [r.subjectId.toString(), r.total_score]));
    const secondBySubject = new Map(secondResults.map(r => [r.subjectId.toString(), r.total_score]));
    const firstTermCourses = new Set(firstResults.map((r: any) => r.subjectId.toString()));
    const secondTermCourses = new Set(secondResults.map((r: any) => r.subjectId.toString()));

    const enriched = results.map(r => {
      const currentTotal = Number(r.total_score);
      const firstScore = Number(firstBySubject.get(r.subjectId.toString()) ?? 0);
      const secondScore = Number(secondBySubject.get(r.subjectId.toString()) ?? 0);

      let divisor = 1;
      if (firstTermCourses.has(r.subjectId.toString())) divisor++;
      if (secondTermCourses.has(r.subjectId.toString())) divisor++;

      const cumulative = currentTotal + firstScore + secondScore;
      const average = divisor > 0 ? cumulative / divisor : currentTotal;

      let grade = 'F';
      let remark = 'Failed';
      if (average >= 75) { grade = 'A'; remark = 'Excellent'; }
      else if (average >= 65) { grade = 'B'; remark = 'Very Good'; }
      else if (average >= 55) { grade = 'C'; remark = 'Good'; }
      else if (average >= 45) { grade = 'D'; remark = 'Pass'; }
      else { grade = 'F'; remark = 'Fail'; }

      return {
        ...r,
        first_term_score: firstBySubject.get(r.subjectId.toString()) ?? '-',
        second_term_score: secondBySubject.get(r.subjectId.toString()) ?? '-',
        cumulative: cumulative.toFixed(1),
        average: average.toFixed(1),
        grade,
        remark,
      };
    });

    const classTeacher = classWithTeacher?.classTeacher ?? null;

    return this.ok({
      student: {
        firstName: user.firstName,
        lastName: user.lastName,
        image: user.image,
        uniqueId: user.uniqueId,
      },
      results: enriched,
      attendance,
      session,
      term,
      class: user.student.classRoom?.name,
      teacher: classTeacher ? { name: `${classTeacher.user.firstName} ${classTeacher.user.lastName}`, image: classTeacher.user.image } : null,
      principal: principal ? { name: `${principal.firstName} ${principal.lastName}`, image: principal.image } : null,
      trait: trait ? {
        punctuality: trait.punctuality, perseverance: trait.perseverance, responsibility: trait.responsibility,
        diligence: trait.diligence, selfControl: trait.selfControl, honesty: trait.honesty,
        attendance: trait.attendance, attentiveness: trait.attentiveness, creativity: trait.creativity, curiosity: trait.curiosity,
        drawing: trait.drawing, physicalActivity: trait.physicalActivity, accuracy: trait.accuracy,
        handlingOfTools: trait.handlingOfTools, mentalSkills: trait.mentalSkills,
      } : null,
      principalComment: null,
      teacherComment: classTeacher?.user?.teacherComment ?? null,
    });
  }

  async approveResults(currentUser: any, studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession(currentUser);
    const term = body.term || await this.getCurrentTerm(currentUser);
    const schoolId = this.schoolId(currentUser);

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = BigInt(schoolId);
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const studentUser = await this.prisma.user.findUnique({
      where: { uniqueId: studentId },
      include: { student: { include: { classRoom: true } }, school: { select: { name: true, website: true } } },
    });

    if (!studentUser || !studentUser.student || !sessionEntity || !termEntity) {
      throw new NotFoundException('Student, session, or term not found');
    }

    const updated = await this.prisma.result.updateMany({
      where: { studentId: studentUser.student.id, sessionId: sessionEntity.id, termId: termEntity.id },
      data: { approvedAt: new Date() }
    });

    await this.notificationService.notify(
      studentUser.id,
      'Results Approved',
      `Your result for ${term} term, ${session} session has been approved.`,
    );
    if (updated.count > 0) {
      const studentName = `${studentUser.firstName} ${studentUser.lastName}`.trim();
      const className = studentUser.student.classRoom?.name ?? 'N/A';
      const schoolName = studentUser.school?.name ?? 'School';
      const termLabel = `${term}`.toUpperCase();
      const resultUrl = this.normalizeWebsiteUrl(studentUser.school?.website);

      this.emailService.sendResultApprovedParent({
        parentEmail: studentUser.email,
        studentName,
        className,
        session,
        term: termLabel,
        schoolName,
        resultUrl,
      }).catch(() => {});

      if (studentUser.telephone) {
        this.smsService.sendResultApprovedSms(
          studentUser.telephone,
          studentName,
          className,
          session,
          termLabel,
          schoolName,
          resultUrl,
        ).catch(() => {});
      }
    }
    return this.ok(null, 'Results approved successfully');
  }

  async unapproveResults(currentUser: any, studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession(currentUser);
    const term = body.term || await this.getCurrentTerm(currentUser);
    const schoolId = this.schoolId(currentUser);

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = BigInt(schoolId);
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });
    const studentUser = await this.prisma.user.findUnique({ where: { uniqueId: studentId }, include: { student: true } });

    if (!studentUser || !studentUser.student || !sessionEntity || !termEntity) {
      throw new NotFoundException('Student, session, or term not found');
    }

    await this.prisma.result.updateMany({
      where: { studentId: studentUser.student.id, sessionId: sessionEntity.id, termId: termEntity.id },
      data: { approvedAt: null }
    });
    return this.ok(null, 'Results unapproved successfully');
  }

  async bulkApproveResults(user: any, body: any) {
    const { student_ids, session: s, term: t } = body;
    if (!student_ids?.length) throw new BadRequestException('No students selected');
    const session = s || await this.getCurrentSession(user);
    const term = t || await this.getCurrentTerm(user);
    for (const id of student_ids) await this.approveResults(user, id, { session, term });
    return this.ok({ approved_count: student_ids.length }, `${student_ids.length} student(s) results approved`);
  }

  async bulkUnapproveResults(user: any, body: any) {
    const { student_ids, session: s, term: t } = body;
    if (!student_ids?.length) throw new BadRequestException('No students selected');
    const session = s || await this.getCurrentSession(user);
    const term = t || await this.getCurrentTerm(user);
    for (const id of student_ids) await this.unapproveResults(user, id, { session, term });
    return this.ok({ unapproved_count: student_ids.length }, `${student_ids.length} student(s) results unapproved`);
  }

  async updatePrincipalComment(currentUser: any, studentId: string, body: any) {
    const session = body.session || await this.getCurrentSession(currentUser);
    const term = body.term || await this.getCurrentTerm(currentUser);
    const schoolId = this.schoolId(currentUser);

    const sessionWhere: any = { name: session };
    if (schoolId) sessionWhere.schoolId = schoolId;
    const sessionEntity = await this.prisma.academicSession.findFirst({ where: sessionWhere });
    const termWhere: any = { name: term.toUpperCase() as any, sessionId: sessionEntity?.id };
    if (schoolId) termWhere.schoolId = BigInt(schoolId);
    const termEntity = await this.prisma.academicTerm.findFirst({ where: termWhere });

    const studentUser = await this.prisma.user.findUnique({ where: { uniqueId: studentId }, include: { student: true } });
    if (!studentUser || !studentUser.student) throw new NotFoundException('Student not found');

    const comment = body.principal_comment || body.comment || '';
    const existing = await this.prisma.attendance.findFirst({ 
      where: { studentId: studentUser.student.id, sessionId: sessionEntity?.id, termId: termEntity?.id } 
    });

    if (existing) {
      await this.prisma.attendance.update({ 
        where: { id: existing.id }, 
        data: { principalComment: comment } 
      });
    } else {
      await this.prisma.attendance.create({ 
        data: { 
          studentId: studentUser.student.id, 
          sessionId: sessionEntity!.id, 
          termId: termEntity!.id, 
          principalComment: comment 
        } 
      });
    }
    return this.ok({ student_id: studentId, session, term, principal_comment: comment }, 'Comment updated successfully');
  }

  async getSchoolDays() {
    return this.ok(await this.prisma.schoolDays.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  async setSchoolDays(body: any) {
    const { session, term, total_days } = body;
    if (!session || !term || !total_days) throw new BadRequestException('Session, term, and total_days are required');
    await this.prisma.schoolDays.upsert({
      where: { session_term: { session, term } },
      update: { totalDays: Number(total_days) },
      create: { session, term, totalDays: Number(total_days) }
    });
    return this.ok(null, 'School days set successfully');
  }

  async deleteSchoolDays(session: string, term: string) {
    await this.prisma.schoolDays.deleteMany({ where: { session, term } });
    return this.ok(null, 'School days deleted successfully');
  }

  // ── Promotions ────────────────────────────────────────────────────────
  async getPromotionClasses(user: any) {
    const schoolId = this.schoolId(user);
    const classes = await this.prisma.classRoom.findMany({
      where: { ...(schoolId ? { schoolId } : {}) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    });
    return this.ok(classes.map(c => ({ id: c.id.toString(), name: c.name, studentCount: c._count.students })));
  }

  async promoteClass(user: any, body: { fromClassId: string; toClassId: string }) {
    const { fromClassId, toClassId } = body;
    if (!fromClassId || !toClassId) throw new BadRequestException('fromClassId and toClassId are required');
    if (fromClassId === toClassId) throw new BadRequestException('Source and destination class must be different');

    const students = await this.prisma.student.findMany({
      where: { classRoomId: BigInt(fromClassId) },
      select: { id: true },
    });
    if (!students.length) throw new BadRequestException('No students found in the selected class');

    await this.prisma.student.updateMany({
      where: { classRoomId: BigInt(fromClassId) },
      data: { classRoomId: BigInt(toClassId) },
    });
    return this.ok({ count: students.length }, `${students.length} student(s) promoted successfully`);
  }

  async repeatStudents(user: any, body: { studentIds: string[] }) {
    const { studentIds } = body;
    if (!studentIds?.length) throw new BadRequestException('No students selected');

    // Repeating = keep in same class, just return confirmation
    // Optionally mark them — here we simply confirm they stay
    const students = await this.prisma.student.findMany({
      where: { user: { uniqueId: { in: studentIds } } },
      include: { user: true },
    });
    if (!students.length) throw new NotFoundException('No students found');

    return this.ok({ count: students.length }, `${students.length} student(s) marked to repeat`);
  }

  async transferStudent(user: any, body: { studentId: string; toClassId: string }) {
    const { studentId, toClassId } = body;
    if (!studentId || !toClassId) throw new BadRequestException('studentId and toClassId are required');

    const student = await this.prisma.student.findUnique({ where: { id: BigInt(studentId) } });
    if (!student) throw new NotFoundException('Student not found');

    await this.prisma.student.update({
      where: { id: BigInt(studentId) },
      data: { classRoomId: BigInt(toClassId) },
    });
    return this.ok(null, 'Student transferred successfully');
  }

  async getNotifications(user: any) {
    const found = await this.prisma.user.findFirst({ where: { uniqueId: user.id?.toString() }, select: { id: true } });
    if (!found) return this.ok([]);
    const items = await this.prisma.notification.findMany({
      where: { userId: found.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.ok(items.map(n => ({ ...n, id: n.id.toString(), userId: n.userId.toString() })));
  }

  async markNotificationsRead(user: any) {
    const found = await this.prisma.user.findFirst({ where: { uniqueId: user.id?.toString() }, select: { id: true } });
    if (found) {
      await this.prisma.notification.updateMany({ where: { userId: found.id, readAt: null }, data: { readAt: new Date() } });
    }
    return this.ok(null, 'Notifications marked as read');
  }

  private async getCurrentSession(user?: any): Promise<string> {
    const schoolId = user?.schoolId ? BigInt(user.schoolId) : undefined;
    const where = schoolId ? { schoolId } : {};
    const r = await this.prisma.academicSession.findFirst({ where: { ...where, isCurrent: true } })
      ?? await this.prisma.academicSession.findFirst({ where, orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async getCurrentTerm(user?: any): Promise<string> {
    const schoolId = user?.schoolId ? BigInt(user.schoolId) : undefined;
    const where: any = schoolId ? { schoolId } : {};
    const r = await this.prisma.academicTerm.findFirst({ where: { ...where, isCurrent: true } })
      ?? await this.prisma.academicTerm.findFirst({ where, orderBy: { createdAt: 'desc' } });
    return r?.name || '';
  }

  private async generateStudentId(schoolId?: bigint): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = await this.schoolPrefix(schoolId);
    const last = await this.prisma.user.findFirst({ 
      where: { role: 'STUDENT', ...(schoolId ? { schoolId } : {}) }, 
      orderBy: { createdAt: 'desc' }, 
      select: { uniqueId: true } 
    });
    const num = last ? parseInt(last.uniqueId.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `${prefix}${year}${String(num).padStart(4, '0')}`;
  }

  private async generateStaffId(schoolId?: bigint): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = await this.schoolPrefix(schoolId);
    const last = await this.prisma.user.findFirst({ 
      where: { role: 'STAFF', ...(schoolId ? { schoolId } : {}) }, 
      orderBy: { createdAt: 'desc' }, 
      select: { uniqueId: true } 
    });
    const num = last ? parseInt(last.uniqueId.replace(/\D/g, '').slice(-4) || '0') + 1 : 1;
    return `${prefix}S${year}${String(num).padStart(4, '0')}`;
  }

  private async schoolPrefix(schoolId?: bigint): Promise<string> {
    if (!schoolId) return 'SCH';
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { slug: true } });
    if (!school?.slug) return 'SCH';
    // Take up to 3 uppercase letters from the slug words
    const words = school.slug.split('-').filter(Boolean);
    const prefix = words.length >= 3
      ? words.slice(0, 3).map(w => w[0]).join('').toUpperCase()
      : words.map(w => w.slice(0, Math.ceil(3 / words.length))).join('').slice(0, 3).toUpperCase();
    return prefix || 'SCH';
  }

  private pick(data: any, keys: string[]) {
    const update: any = {};
    keys.forEach(key => {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') update[key] = data[key];
    });
    return update;
  }

  private async findManagedSchool(user: any) {
    const currentUser = await this.prisma.user.findFirst({
      where: { uniqueId: user.uniqueId ?? String(user.id) },
      select: { schoolId: true },
    });

    const school = currentUser?.schoolId
      ? await this.prisma.school.findUnique({ where: { id: currentUser.schoolId } })
      : await this.prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  private serializeSchool(school: any) {
    return {
      ...school,
      id: school.id?.toString(),
      location: [school.address, school.city, school.state, school.country].filter(Boolean).join(', '),
      colors: {
        primary: school.primaryColor,
        secondary: school.secondaryColor,
        accent: school.accentColor,
      },
    };
  }

  private async resultsWithTotals(where: any) {
    const rows = await this.prisma.result.findMany({ where, include: { subject: true } });
    return rows.map(row => ({ 
      ...row, 
      id: row.id.toString(),
      course: row.subject.name,
      test_score: row.testScore.toString(),
      exam_score: row.examScore.toString(),
      total_score: (Number(row.testScore) + Number(row.examScore)).toString()
    }));
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────
  async broadcast(user: any, body: { target: 'all_students' | 'all_staff' | string; message: string; channel?: 'inapp' | 'email' }) {
    const schoolId = this.schoolId(user);
    const where: any = { ...(schoolId ? { schoolId } : {}) };
    if (body.target === 'all_students') where.role = 'STUDENT';
    else if (body.target === 'all_staff') where.role = 'STAFF';
    else where.student = { classRoom: { name: body.target } };

    const targets = await this.prisma.user.findMany({ where, select: { id: true, email: true } });
    const senderId = BigInt(user.id ?? user.authUserId);

    if (!body.channel || body.channel === 'inapp') {
      await this.prisma.message.createMany({
        data: targets.map(t => ({ senderId, receiverId: t.id, body: body.message })),
        skipDuplicates: true,
      });
    }
    return this.ok({ sent: targets.length }, `Broadcast sent to ${targets.length} users`);
  }

  // ── Exam Timetable ─────────────────────────────────────────────────────────
  async getExamTimetables(user: any) {
    const rows = await this.prisma.examTimetable.findMany({ orderBy: { createdAt: 'desc' } });
    return this.ok(rows.map(r => ({ ...r, id: r.id.toString(), content: r.content })));
  }

  async createExamTimetable(user: any, body: { level: string; content: any }) {
    const row = await this.prisma.examTimetable.create({ data: { level: body.level, content: typeof body.content === 'string' ? body.content : JSON.stringify(body.content) } });
    return this.ok({ ...row, id: row.id.toString() }, 'Created');
  }

  async updateExamTimetable(id: string, body: { level?: string; content?: any }) {
    const data: any = {};
    if (body.level !== undefined) data.level = body.level;
    if (body.content !== undefined) data.content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
    const row = await this.prisma.examTimetable.update({ where: { id: BigInt(id) }, data });
    return this.ok({ ...row, id: row.id.toString() }, 'Updated');
  }

  async deleteExamTimetable(id: string) {
    await this.prisma.examTimetable.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Deleted');
  }

  // ── Staff Performance ──────────────────────────────────────────────────────
  async getStaffPerformance(user: any) {
    const schoolId = this.schoolId(user);
    const staffList = await this.prisma.staff.findMany({
      where: schoolId ? { user: { schoolId } } : {},
      include: { user: { select: { firstName: true, lastName: true, uniqueId: true } } },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const results = await Promise.all(staffList.map(async (s) => {
      const [attendance, leaves] = await Promise.all([
        this.prisma.staffAttendance.findMany({ where: { staffId: s.id, date: { gte: monthStart } } }),
        this.prisma.leaveRequest.count({ where: { staffId: s.id, createdAt: { gte: yearStart }, status: 'APPROVED' } }),
      ]);
      const present = attendance.filter(a => a.status === 'PRESENT').length;
      const total = attendance.length;
      return {
        id: s.id.toString(),
        name: `${s.user.firstName} ${s.user.lastName}`,
        uniqueId: s.user.uniqueId,
        role: s.staffRole ?? 'Staff',
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
        attendanceDays: total,
        leaveCount: leaves,
      };
    }));

    return this.ok(results);
  }

  // ── Settings (principal, signature, class-teacher) ─────────────────────────
  async getSettings(user: any) {
    const school = await this.findManagedSchool(user);
    const schoolId = school.id;

    const [classes, staffList] = await Promise.all([
      this.prisma.classRoom.findMany({
        where: { schoolId },
        orderBy: { name: 'asc' },
        include: { classTeacher: { include: { user: { select: { firstName: true, lastName: true, uniqueId: true } } } } },
      }),
      this.prisma.staff.findMany({
        where: { user: { schoolId } },
        include: { user: { select: { firstName: true, lastName: true, uniqueId: true, image: true } } },
      }),
    ]);

    return this.ok({
      principal: (school as any).principal ?? null,
      signature: (school as any).signature ?? null,
      classes: classes.map(c => ({
        id: c.id.toString(),
        name: c.name,
        teacherUniqueId: c.classTeacher?.user.uniqueId ?? null,
        teacherName: c.classTeacher ? `${c.classTeacher.user.firstName} ${c.classTeacher.user.lastName}` : null,
      })),
      staff: staffList.map(s => ({
        uniqueId: s.user.uniqueId,
        name: `${s.user.firstName} ${s.user.lastName}`,
        image: s.user.image ?? null,
      })),
    });
  }

  async updateSettings(user: any, data: any) {
    const school = await this.findManagedSchool(user);

    // Update principal and/or signature on the school record
    const schoolUpdate: any = {};
    if (data.principal !== undefined) schoolUpdate.principal = data.principal || null;
    if (data.signature !== undefined) schoolUpdate.signature = data.signature || null;

    if (Object.keys(schoolUpdate).length > 0) {
      await this.prisma.school.update({ where: { id: school.id }, data: schoolUpdate as any });
    }

    // Update class-teacher assignments: [{ classId, teacherUniqueId }]
    if (Array.isArray(data.classTeachers)) {
      for (const assignment of data.classTeachers) {
        const classRoom = await this.prisma.classRoom.findFirst({ where: { id: BigInt(assignment.classId), schoolId: school.id } });
        if (!classRoom) continue;

        if (!assignment.teacherUniqueId) {
          // Remove teacher assignment
          await this.prisma.classRoom.update({ where: { id: classRoom.id }, data: { classTeacherId: null } });
        } else {
          const staff = await this.prisma.staff.findFirst({
            where: { user: { uniqueId: assignment.teacherUniqueId, schoolId: school.id } },
          });
          if (staff) {
            await this.prisma.classRoom.update({ where: { id: classRoom.id }, data: { classTeacherId: staff.id } });
          }
        }
      }
    }

    return this.ok(null, 'Settings saved successfully');
  }

  async uploadSignature(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const school = await this.findManagedSchool(user);
    const url = await uploadToCloudinary(file, 'signatures');
    await this.prisma.school.update({ where: { id: school.id }, data: { signature: url } as any });
    return this.ok({ signature: url }, 'Signature uploaded successfully');
  }
}
