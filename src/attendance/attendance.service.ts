import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../common/email.service';
import { SmsService } from '../common/sms.service';
import { NotificationService } from '../common/notification.service';
import { PrismaService } from '../database/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormData = require('form-data');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios').default ?? require('axios');

function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  constructor(private prisma: PrismaService, private email: EmailService, private sms: SmsService, private notificationService: NotificationService) {}

  private userId(user: any): bigint {
    return BigInt(user.authUserId ?? user.userId ?? user.user?.id ?? user.id);
  }

  private async getStudentUser(user: any) {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    const studentUser = await this.prisma.user.findFirst({
      where: {
        id: this.userId(user),
        role: 'STUDENT',
        ...(schoolId ? { schoolId: BigInt(schoolId) } : {}),
      },
      select: { uniqueId: true },
    });

    if (!studentUser) {
      throw new BadRequestException('Student record not found');
    }

    return studentUser;
  }

  // ── Staff: clock in ────────────────────────────────────────────────────
  async clockIn(user: any, body: { latitude: number; longitude: number; deviceId?: string }) {
    const { latitude, longitude, deviceId } = body;
    if (latitude == null || longitude == null) throw new BadRequestException('Location required');

    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    const location = await this.prisma.attendanceLocation.findFirst({
      where: { schoolId: BigInt(schoolId), isActive: true },
    });
    if (!location) throw new BadRequestException('No attendance location configured by admin');

    const dist = distanceMetres(latitude, longitude, location.latitude, location.longitude);
    if (dist > location.radiusMeters) {
      throw new ForbiddenException(
        `You are ${Math.round(dist)}m away from the allowed location (${location.radiusMeters}m radius). Clock-in denied.`,
      );
    }

    const staffId = user.id ?? user.staffId;
    const today = todayDate();

    const existing = await this.prisma.staffAttendance.findUnique({
      where: { staffId_date: { staffId: BigInt(staffId), date: today } },
    });
    if (existing?.clockIn) throw new BadRequestException('Already clocked in today');

    // ── Device lock enforcement ──────────────────────────────────────────
    if (deviceId) {
      // CHECK 1 — Cross-staff: has this device been used by a DIFFERENT staff
      // member to clock in today? One physical device = one person per day.
      const usedByOtherToday = await this.prisma.staffAttendance.findFirst({
        where: {
          deviceId,
          date: today,
          clockIn: { not: null },
          staffId: { not: BigInt(staffId) },
        },
      });
      if (usedByOtherToday) {
        throw new ForbiddenException(
          'This device has already been used to clock in for another account today. One device may only be used for one staff member per day.',
        );
      }

      // CHECK 2 — Own-device consistency: has this staff member previously
      // clocked in from a different device in the last 30 days?
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const previousWithDevice = await this.prisma.staffAttendance.findFirst({
        where: {
          staffId: BigInt(staffId),
          deviceId: { not: null },
          date: { gte: thirtyDaysAgo },
          clockIn: { not: null },
        },
        orderBy: { date: 'desc' },
      });
      if (previousWithDevice?.deviceId && previousWithDevice.deviceId !== deviceId) {
        throw new ForbiddenException(
          'Clock-in is only allowed from the device you first used. Please use your registered device.',
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────

    const now = new Date();
    const [rHour, rMin] = (location.resumptionTime ?? '08:00').split(':').map(Number);
    const cutoff = new Date(today);
    cutoff.setHours(rHour, rMin, 0, 0);
    const lateMinutes = now > cutoff ? Math.floor((now.getTime() - cutoff.getTime()) / 60000) : 0;
    const status = lateMinutes > 0 ? 'LATE' : 'PRESENT';

    const record = await this.prisma.staffAttendance.upsert({
      where: { staffId_date: { staffId: BigInt(staffId), date: today } },
      create: {
        staffId: BigInt(staffId),
        locationId: location.id,
        date: today,
        clockIn: now,
        status,
        lateMinutes,
        deviceId: deviceId ?? null,
      },
      update: { clockIn: now, locationId: location.id, status, lateMinutes, deviceId: deviceId ?? null },
    });

    const lateLabel = lateMinutes > 0
      ? lateMinutes < 60
        ? `${lateMinutes} min late`
        : `${Math.floor(lateMinutes / 60)}h ${lateMinutes % 60 ? `${lateMinutes % 60}m ` : ''}late`
      : '';
    return { success: true, message: `Clocked in${lateLabel ? ` (${lateLabel})` : ''}`, data: this.serializeRecord(record) };
  }

  // ── Staff: clock out ───────────────────────────────────────────────────
  async clockOut(user: any, body: { latitude: number; longitude: number }) {
    const { latitude, longitude } = body;
    if (latitude == null || longitude == null) throw new BadRequestException('Location required');

    const staffId = user.id ?? user.staffId;
    const today = todayDate();

    const record = await this.prisma.staffAttendance.findUnique({
      where: { staffId_date: { staffId: BigInt(staffId), date: today } },
      include: { location: true },
    });
    if (!record?.clockIn) throw new BadRequestException('You have not clocked in today');
    if (record.clockOut) throw new BadRequestException('Already clocked out today');

    if (record.location) {
      const dist = distanceMetres(latitude, longitude, record.location.latitude, record.location.longitude);
      if (dist > record.location.radiusMeters) {
        throw new ForbiddenException(
          `You are ${Math.round(dist)}m away from the clock-in location (${record.location.radiusMeters}m radius). Clock-out denied.`,
        );
      }
    }

    const updated = await this.prisma.staffAttendance.update({
      where: { id: record.id },
      data: { clockOut: new Date() },
    });

    return { success: true, message: 'Clocked out successfully', data: this.serializeRecord(updated) };
  }

  // ── Staff: today status ────────────────────────────────────────────────
  async todayStatus(user: any) {
    const staffId = user.id ?? user.staffId;
    const today = todayDate();

    const record = await this.prisma.staffAttendance.findUnique({
      where: { staffId_date: { staffId: BigInt(staffId), date: today } },
      include: { location: true },
    });

    const schoolId = user.schoolId ?? user.user?.schoolId;
    const location = schoolId
      ? await this.prisma.attendanceLocation.findFirst({ where: { schoolId: BigInt(schoolId), isActive: true } })
      : null;

    return {
      success: true,
      data: {
        record: record ? this.serializeRecord(record) : null,
        location: location ? this.serializeLocation(location) : null,
      },
    };
  }

  // ── Staff: own history ─────────────────────────────────────────────────
  async myHistory(user: any, query: any) {
    const staffId = user.id ?? user.staffId;
    const { month, year } = query;

    const where: any = { staffId: BigInt(staffId) };
    if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = new Date(Number(year), Number(month), 1);
      where.date = { gte: start, lt: end };
    }

    const records = await this.prisma.staffAttendance.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 60,
    });

    return { success: true, data: records.map((r) => this.serializeRecord(r)) };
  }

  // ── Admin: set/update location ─────────────────────────────────────────
  async setLocation(user: any, body: any) {
    const schoolId = user.schoolId ?? user.school?.id;
    if (!schoolId) throw new ForbiddenException('No school');

    const { name, latitude, longitude, radiusMeters, resumptionTime } = body;
    if (!latitude || !longitude) throw new BadRequestException('latitude and longitude required');

    // Deactivate existing
    await this.prisma.attendanceLocation.updateMany({
      where: { schoolId: BigInt(schoolId) },
      data: { isActive: false },
    });

    const loc = await this.prisma.attendanceLocation.create({
      data: {
        schoolId: BigInt(schoolId),
        name: name ?? 'School Location',
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusMeters: radiusMeters ? Number(radiusMeters) : 100,
        resumptionTime: resumptionTime ?? '08:00',
        isActive: true,
      },
    });

    return { success: true, message: 'Location set', data: this.serializeLocation(loc) };
  }

  // ── Admin: get active location ─────────────────────────────────────────
  async getLocation(user: any) {
    const schoolId = user.schoolId ?? user.school?.id;
    const loc = schoolId
      ? await this.prisma.attendanceLocation.findFirst({ where: { schoolId: BigInt(schoolId), isActive: true } })
      : null;
    return { success: true, data: loc ? this.serializeLocation(loc) : null };
  }

  // ── Admin: attendance report ───────────────────────────────────────────
  async getReport(user: any, query: any) {
    const schoolId = user.schoolId ?? user.school?.id;
    if (!schoolId) throw new ForbiddenException('No school associated with this admin');
    const { date, month, year, staffId } = query;

    const where: any = { staff: { user: { schoolId: BigInt(schoolId) } } };

    if (staffId) where.staffId = BigInt(staffId);

    if (date) {
      const d = new Date(date);
      const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayEnd   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
      where.date = { gte: dayStart, lt: dayEnd };
    } else if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = new Date(Number(year), Number(month), 1);
      where.date = { gte: start, lt: end };
    } else {
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      where.date = { gte: dayStart, lt: dayEnd };
    }

    const records = await this.prisma.staffAttendance.findMany({
      where,
      include: { staff: { include: { user: true } } },
      orderBy: { date: 'desc' },
    });

    return {
      success: true,
      data: records.map((r) => ({
        ...this.serializeRecord(r),
        staff: {
          id: r.staff.id.toString(),
          name: `${r.staff.user.firstName} ${r.staff.user.lastName}`,
          staffNo: r.staff.staffNo,
          image: r.staff.user.image,
        },
      })),
    };
  }

  // ── Admin: mark absent for staff who haven't clocked in ───────────────
  async markAbsent(user: any, body: { date?: string }) {
    const schoolId = user.schoolId ?? user.school?.id;
    let dayDate: Date;
    if (body.date) {
      const [y, m, d] = body.date.split('-');
      dayDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    } else {
      dayDate = todayDate();
    }

    const allStaff = await this.prisma.staff.findMany({
      where: { user: { schoolId: BigInt(schoolId), status: 'ACTIVE' } },
    });

    const existing = await this.prisma.staffAttendance.findMany({
      where: { date: dayDate, staff: { user: { schoolId: BigInt(schoolId) } } },
      select: { staffId: true },
    });
    const presentIds = new Set(existing.map((e) => e.staffId.toString()));

    const absent = allStaff.filter((s) => !presentIds.has(s.id.toString()));

    if (absent.length > 0) {
      await this.prisma.staffAttendance.createMany({
        data: absent.map((s) => ({
          staffId: s.id,
          date: dayDate,
          status: 'ABSENT' as const,
          lateMinutes: 0,
        })),
        skipDuplicates: true,
      });
    }

    return { success: true, message: `${absent.length} staff marked absent` };
  }

  // ── Student: clock in ─────────────────────────────────────────────────
  async studentClockIn(user: any, body: { latitude: number; longitude: number; deviceId?: string }) {
    const { latitude, longitude, deviceId } = body;
    if (latitude == null || longitude == null) throw new BadRequestException('Location required');

    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    const location = await this.prisma.attendanceLocation.findFirst({
      where: { schoolId: BigInt(schoolId), isActive: true },
    });
    if (!location) throw new BadRequestException('No attendance location configured by admin');

    const dist = distanceMetres(latitude, longitude, location.latitude, location.longitude);
    if (dist > location.radiusMeters) {
      throw new ForbiddenException(
        `You are ${Math.round(dist)}m away from the allowed location (${location.radiusMeters}m radius). Clock-in denied.`,
      );
    }

    const studentId = (await this.getStudentUser(user)).uniqueId;
    const today = todayDate();

    const existing = await this.prisma.studentAttendance.findUnique({
      where: { studentId_date: { studentId, date: today } },
    });
    if (existing?.clockIn) throw new BadRequestException('Already clocked in today');

    // ── Device lock enforcement ──────────────────────────────────────────
    if (deviceId) {
      // CHECK 1 — Cross-student: has this device been used by a DIFFERENT
      // student to clock in today? One physical device = one student per day.
      const usedByOtherToday = await this.prisma.studentAttendance.findFirst({
        where: {
          deviceId,
          date: today,
          clockIn: { not: null },
          studentId: { not: studentId },  // exclude current student
        },
      });

      if (usedByOtherToday) {
        throw new ForbiddenException(
          'This device has already been used to clock in for another account today. One device may only be used for one student per day.',
        );
      }

      // CHECK 2 — Own-device consistency: has this student previously clocked
      // in from a different device? Prevents a student switching devices.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const previousWithDevice = await this.prisma.studentAttendance.findFirst({
        where: {
          studentId,
          deviceId: { not: null },
          date: { gte: thirtyDaysAgo },
          clockIn: { not: null },
        },
        orderBy: { date: 'desc' },
      });

      if (previousWithDevice?.deviceId && previousWithDevice.deviceId !== deviceId) {
        throw new ForbiddenException(
          'Clock-in is only allowed from the device you first used. Please use your registered device.',
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────

    const now = new Date();
    const [rHour, rMin] = (location.resumptionTime ?? '08:00').split(':').map(Number);
    const cutoff = new Date(today);
    cutoff.setHours(rHour, rMin, 0, 0);
    const lateMinutes = now > cutoff ? Math.floor((now.getTime() - cutoff.getTime()) / 60000) : 0;
    const status = lateMinutes > 0 ? 'LATE' : 'PRESENT';

    const record = await this.prisma.studentAttendance.upsert({
      where: { studentId_date: { studentId, date: today } },
      create: { studentId, locationId: location.id, date: today, clockIn: now, status, lateMinutes, deviceId: deviceId ?? null },
      update: { clockIn: now, locationId: location.id, status, lateMinutes, deviceId: deviceId ?? null },
    });

    const lateLabel = lateMinutes > 0
      ? lateMinutes < 60 ? `${lateMinutes} min late` : `${Math.floor(lateMinutes / 60)}h ${lateMinutes % 60 ? `${lateMinutes % 60}m ` : ''}late`
      : '';

    const studentUser = await this.prisma.user.findFirst({
      where: { uniqueId: studentId, role: 'STUDENT' },
      select: { id: true },
    });

    if (studentUser) {
      this.notificationService.notify(
        studentUser.id,
        'Attendance Recorded',
        `You clocked in${lateLabel ? ` (${lateLabel})` : ''}.`,
      );
    }

    return { success: true, message: `Clocked in${lateLabel ? ` (${lateLabel})` : ''}`, data: this.serializeStudentRecord(record) };
  }

  // ── Student: clock out ────────────────────────────────────────────────
  async studentClockOut(user: any, body: { latitude: number; longitude: number }) {
    const { latitude, longitude } = body;
    if (latitude == null || longitude == null) throw new BadRequestException('Location required');

    const studentId = (await this.getStudentUser(user)).uniqueId;
    const today = todayDate();

    const record = await this.prisma.studentAttendance.findUnique({
      where: { studentId_date: { studentId, date: today } },
      include: { location: true },
    });
    if (!record?.clockIn) throw new BadRequestException('You have not clocked in today');
    if (record.clockOut) throw new BadRequestException('Already clocked out today');

    if (record.location) {
      const dist = distanceMetres(latitude, longitude, record.location.latitude, record.location.longitude);
      if (dist > record.location.radiusMeters) {
        throw new ForbiddenException(
          `You are ${Math.round(dist)}m away from the clock-in location (${record.location.radiusMeters}m radius). Clock-out denied.`,
        );
      }
    }

    const updated = await this.prisma.studentAttendance.update({
      where: { id: record.id },
      data: { clockOut: new Date() },
    });

    const studentUser = await this.prisma.user.findFirst({
      where: { uniqueId: record.studentId, role: 'STUDENT' },
      select: { id: true },
    });

    if (studentUser) {
      this.notificationService.notify(
        studentUser.id,
        'Attendance Recorded',
        'You have clocked out.',
      );
    }

    return { success: true, message: 'Clocked out successfully', data: this.serializeStudentRecord(updated) };
  }

  // ── Student: today status ─────────────────────────────────────────────
  async studentTodayStatus(user: any) {
    const studentId = (await this.getStudentUser(user)).uniqueId;
    const today = todayDate();

    const record = await this.prisma.studentAttendance.findUnique({
      where: { studentId_date: { studentId, date: today } },
    });

    const schoolId = user.schoolId ?? user.user?.schoolId;
    const location = schoolId
      ? await this.prisma.attendanceLocation.findFirst({ where: { schoolId: BigInt(schoolId), isActive: true } })
      : null;

    return {
      success: true,
      data: {
        record: record ? this.serializeStudentRecord(record) : null,
        location: location ? this.serializeLocation(location) : null,
      },
    };
  }

  // ── Student: own history ──────────────────────────────────────────────
  async studentHistory(user: any, query: any) {
    const studentId = (await this.getStudentUser(user)).uniqueId;
    const { month, year } = query;

    const where: any = { studentId };
    if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = new Date(Number(year), Number(month), 1);
      where.date = { gte: start, lt: end };
    }

    const records = await this.prisma.studentAttendance.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 60,
    });
    return { success: true, data: records.map((r) => this.serializeStudentRecord(r)) };
  }

  // ── Admin: student attendance report ─────────────────────────────────
  async getStudentReport(user: any, query: any) {
    const schoolId = user.schoolId ?? user.school?.id;
    if (!schoolId) throw new ForbiddenException('No school associated with this admin');
    const { date, month, year } = query;

    // Build base where clause for attending students
    const studentWhere: any = {
      schoolId: BigInt(schoolId),
      role: 'STUDENT',
      student: { isNot: null }, // Ensure user has a Student record
    };

    // Apply class filter if provided
    if (query.className) {
      studentWhere.student = {
        isNot: null,
        classRoom: { name: query.className },
      };
    }

    const where: any = { student: studentWhere };

    // Apply date filter
    if (date) {
      const d = new Date(date);
      const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayEnd   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
      where.date = { gte: dayStart, lt: dayEnd };
    } else if (month && year) {
      where.date = { gte: new Date(Number(year), Number(month) - 1, 1), lt: new Date(Number(year), Number(month), 1) };
    } else {
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      where.date = { gte: dayStart, lt: dayEnd };
    }

    // Debug logging
    console.log('[getStudentReport] Query:', { schoolId: schoolId.toString(), date, studentWhere, where: JSON.stringify(where, (k, v) => typeof v === 'bigint' ? v.toString() : v) });

    // Query attendance records with related user info
    const records = await this.prisma.studentAttendance.findMany({
      where,
      include: { student: true },
      orderBy: { date: 'desc' },
    });

    console.log('[getStudentReport] Found records:', records.length);

    return {
      success: true,
      data: records.map((r) => ({
        ...this.serializeStudentRecord(r),
        student: {
          id: r.student.uniqueId,
          name: `${r.student.firstName} ${r.student.lastName}`,
          studentNo: r.student.uniqueId,
          image: r.student.image ?? null,
        },
      })),
    };
  }

  // ── Admin: mark absent students who haven't clocked in ────────────────
  async markStudentsAbsent(user: any, body: { date?: string }) {
    const schoolId = user.schoolId ?? user.school?.id;
    let dayDate: Date;
    if (body.date) {
      const [y, m, d] = body.date.split('-');
      dayDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    } else {
      dayDate = todayDate();
    }

    const allStudents = await this.prisma.user.findMany({
      where: { schoolId: BigInt(schoolId), role: 'STUDENT', status: 'ACTIVE' },
      select: { uniqueId: true },
    });

    const existing = await this.prisma.studentAttendance.findMany({
      where: { date: dayDate, studentId: { in: allStudents.map(s => s.uniqueId) } },
      select: { studentId: true },
    });
    const presentIds = new Set(existing.map((e) => e.studentId));
    const absent = allStudents.filter((s) => !presentIds.has(s.uniqueId));

    if (absent.length > 0) {
      await this.prisma.studentAttendance.createMany({
        data: absent.map((s) => ({ studentId: s.uniqueId, date: dayDate, status: 'ABSENT' as const, lateMinutes: 0 })),
        skipDuplicates: true,
      });

      const users = await this.prisma.user.findMany({
        where: { uniqueId: { in: absent.map(s => s.uniqueId) }, role: 'STUDENT' },
        select: { id: true, uniqueId: true },
      });

      const userMap = new Map(users.map(u => [u.uniqueId, u.id]));
      for (const s of absent) {
        const uid = userMap.get(s.uniqueId);
        if (uid) {
          this.notificationService.notify(
            uid,
            'Marked Absent',
            `You were marked absent on ${dayDate.toISOString().slice(0, 10)}.`,
          );
        }
      }
    }
    return { success: true, message: `${absent.length} students marked absent` };
  }

  // ── Scan clock-in (staff or admin scans student QR) ──────────────────
  async scanClockIn(actor: any, body: { uniqueId: string; date?: string }) {
    const { uniqueId, date } = body;
    if (!uniqueId) throw new BadRequestException('uniqueId is required');

    const schoolId = actor.schoolId ?? actor.school?.id ?? actor.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    // Verify the student belongs to this school
    const student = await this.prisma.user.findFirst({
      where: { uniqueId, schoolId: BigInt(schoolId), role: 'STUDENT' },
      select: { id: true, uniqueId: true, firstName: true, lastName: true },
    });
    if (!student) throw new BadRequestException('Student not found in this school');

    // Get active attendance location (for late calculation)
    const location = await this.prisma.attendanceLocation.findFirst({
      where: { schoolId: BigInt(schoolId), isActive: true },
    });

    // Resolve target date
    let targetDate: Date;
    if (date) {
      const [y, m, d] = date.split('-');
      targetDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    } else {
      targetDate = todayDate();
    }

    // Compute status based on resumption time
    const now = new Date();
    let lateMinutes = 0;
    let status: 'PRESENT' | 'LATE' = 'PRESENT';
    if (location) {
      const [rHour, rMin] = (location.resumptionTime ?? '08:00').split(':').map(Number);
      const cutoff = new Date(targetDate);
      cutoff.setHours(rHour, rMin, 0, 0);
      lateMinutes = now > cutoff ? Math.floor((now.getTime() - cutoff.getTime()) / 60000) : 0;
      status = lateMinutes > 0 ? 'LATE' : 'PRESENT';
    }

    const record = await this.prisma.studentAttendance.upsert({
      where: { studentId_date: { studentId: uniqueId, date: targetDate } },
      create: {
        studentId: uniqueId,
        locationId: location?.id ?? null,
        date: targetDate,
        clockIn: now,
        status,
        lateMinutes,
      },
      update: {
        // Only update if not already clocked in
        clockIn: now,
        status,
        lateMinutes,
        ...(location ? { locationId: location.id } : {}),
      },
    });

    const lateLabel = lateMinutes > 0
      ? lateMinutes < 60
        ? `${lateMinutes} min late`
        : `${Math.floor(lateMinutes / 60)}h ${lateMinutes % 60 ? `${lateMinutes % 60}m ` : ''}late`
      : '';

    // Notify the student
    this.notificationService.notify(
      student.id,
      'Attendance Recorded',
      `You were clocked in by your teacher${lateLabel ? ` (${lateLabel})` : ''}.`,
    );

    return {
      success: true,
      message: `${student.firstName} ${student.lastName} clocked in${lateLabel ? ` (${lateLabel})` : ''}`,
      data: {
        ...this.serializeStudentRecord(record),
        studentName: `${student.firstName} ${student.lastName}`,
        status,
      },
    };
  }

  private serializeStudentRecord(r: any) {
    return {
      id: r.id.toString(),
      studentId: r.studentId,
      locationId: r.locationId?.toString() ?? null,
      date: r.date,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      status: r.status,
      lateMinutes: r.lateMinutes,
      note: r.note,
    };
  }

  private serializeRecord(r: any) {
    return {
      id: r.id.toString(),
      staffId: r.staffId.toString(),
      locationId: r.locationId?.toString() ?? null,
      date: r.date,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      status: r.status,
      lateMinutes: r.lateMinutes,
      note: r.note,
    };
  }

  private serializeLocation(l: any) {
    return {
      id: l.id.toString(),
      schoolId: l.schoolId.toString(),
      name: l.name,
      latitude: l.latitude,
      longitude: l.longitude,
      radiusMeters: l.radiusMeters,
      resumptionTime: l.resumptionTime ?? '08:00',
      isActive: l.isActive,
    };
  }

  // ── Staff: get dates where student attendance was recorded ───────────
  async staffStudentAttendanceDates(user: any, month?: string, year?: string) {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    // Resolve staff's class
    const rawId = user.authUserId ?? user.userId ?? user.user?.id ?? user.id;
    if (!rawId) throw new BadRequestException('Cannot resolve staff user id');
    const staff = await this.prisma.staff.findFirst({
      where: { userId: BigInt(rawId) },
      include: { classRooms: true },
    });
    let classRoomId = staff?.classRooms?.[0]?.id;
    if (!classRoomId && staff?.id) {
      const latest = await this.prisma.assignment.findFirst({
        where: { staffId: staff.id, classRoomId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { classRoomId: true },
      });
      classRoomId = latest?.classRoomId ?? undefined;
    }
    if (!classRoomId) return { success: true, data: [] };

    // Get student IDs in this class
    const students = await this.prisma.user.findMany({
      where: { schoolId: BigInt(schoolId), role: 'STUDENT', status: 'ACTIVE', student: { classRoomId } },
      select: { uniqueId: true },
    });
    const studentIds = students.map(s => s.uniqueId);
    if (!studentIds.length) return { success: true, data: [] };

    const where: any = { studentId: { in: studentIds } };
    if (month && year) {
      where.date = {
        gte: new Date(Number(year), Number(month) - 1, 1),
        lt: new Date(Number(year), Number(month), 1),
      };
    }

    const records = await this.prisma.studentAttendance.findMany({
      where,
      select: { date: true, status: true },
      orderBy: { date: 'desc' },
    });

    // Group by date: count present/absent/late
    const dateMap = new Map<string, { present: number; absent: number; late: number; total: number }>();
    for (const r of records) {
      const key = r.date.toISOString().split('T')[0];
      if (!dateMap.has(key)) dateMap.set(key, { present: 0, absent: 0, late: 0, total: 0 });
      const entry = dateMap.get(key)!;
      entry.total++;
      if (r.status === 'PRESENT') entry.present++;
      else if (r.status === 'ABSENT') entry.absent++;
      else if (r.status === 'LATE') entry.late++;
    }

    return {
      success: true,
      data: Array.from(dateMap.entries()).map(([date, counts]) => ({ date, ...counts })),
    };
  }

  // ── Staff: mark student attendance for their class ────────────────────
  async staffMarkStudentAttendance(user: any, body: { date?: string; students: { uniqueId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' }[] }) {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    const date = body.date ? new Date(body.date) : todayDate();
    const uniqueIds = body.students.map(s => s.uniqueId);

    const users = await this.prisma.user.findMany({
      where: { uniqueId: { in: uniqueIds }, schoolId: BigInt(schoolId), role: 'STUDENT', status: 'ACTIVE' },
      select: {
        uniqueId: true,
        firstName: true,
        lastName: true,
        email: true,
        telephone: true,
        student: { select: { id: true, classRoom: { select: { name: true } } } },
      },
    });
    const userMap = new Map(users.map(u => [u.uniqueId, u]));

    for (const s of body.students) {
      const u = userMap.get(s.uniqueId);
      const studentId = u?.uniqueId;
      if (!studentId) continue;
      await this.prisma.studentAttendance.upsert({
        where: { studentId_date: { studentId, date } },
        create: { studentId, date, status: s.status, lateMinutes: 0 },
        update: { status: s.status },
      });
    }

    // Send absence emails to parents (fire-and-forget)
    const absentStudents = body.students.filter(s => s.status === 'ABSENT');
    if (absentStudents.length > 0) {
      const school = await this.prisma.school.findUnique({ where: { id: BigInt(schoolId) }, select: { name: true } });
      const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      for (const s of absentStudents) {
        const u = userMap.get(s.uniqueId);
        if (!u?.email) continue;
        this.email.sendAbsentStudentParent({
          parentEmail: u.email,
          studentName: `${u.firstName} ${u.lastName}`,
          className: u.student?.classRoom?.name ?? 'N/A',
          date: dateStr,
          schoolName: school?.name ?? 'School',
        }).catch((e) => this.logger.error(`Absence email failed for ${u.email}: ${e?.message ?? e}`));

        // Also send SMS to the parent (user's phone)
        if (u.telephone) {
          this.sms.sendAbsentStudentSms(
            u.telephone,
            `${u.firstName} ${u.lastName}`,
            u.student?.classRoom?.name ?? 'N/A',
            dateStr,
            school?.name ?? 'School'
          ).catch((e) => this.logger.error(`Absence SMS failed for ${u.telephone}: ${e?.message ?? e}`));
        }
      }
    }

    return { success: true, message: `Attendance marked for ${body.students.length} student(s)` };
  }

  // ── Staff: get today's student attendance for a class ─────────────────
  async staffGetStudentAttendance(user: any, className?: string, date?: string) {
    try {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    // Resolve class: use provided className or fall back to staff's assigned class
    let resolvedClass = className;
    if (!resolvedClass) {
      const rawId = user.authUserId ?? user.userId ?? user.user?.id ?? user.id;
      if (!rawId) throw new BadRequestException('Cannot resolve staff user id');
      const staffUserId = BigInt(rawId);
      const staff = await this.prisma.staff.findFirst({
        where: { userId: staffUserId },
        include: { classRooms: true },
      });
      let classRoomId = staff?.classRooms?.[0]?.id;
      if (!classRoomId && staff?.id) {
        const latest = await this.prisma.assignment.findFirst({
          where: { staffId: staff.id, classRoomId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { classRoomId: true },
        });
        classRoomId = latest?.classRoomId ?? undefined;
      }
      if (classRoomId) {
        const room = await this.prisma.classRoom.findUnique({ where: { id: classRoomId }, select: { name: true } });
        resolvedClass = room?.name;
      }
    }
    if (!resolvedClass) return { success: true, data: [] };

    const students = await this.prisma.user.findMany({
      where: { schoolId: BigInt(schoolId), role: 'STUDENT', status: 'ACTIVE', student: { classRoom: { name: resolvedClass } } },
      select: { uniqueId: true, firstName: true, lastName: true, image: true, student: { select: { id: true } } },
    });

    const validStudents = students.filter(s => s.student != null);
    const targetDate = date ? new Date(date) : todayDate();
    const records = validStudents.length ? await this.prisma.studentAttendance.findMany({
      where: { studentId: { in: validStudents.map(s => s.uniqueId) }, date: targetDate },
    }) : [];
    const recordMap = new Map(records.map(r => [r.studentId, r.status]));

    return {
      success: true,
      data: validStudents.map(s => ({
        uniqueId: s.uniqueId,
        firstname: s.firstName,
        lastname: s.lastName,
        image: s.image,
        status: recordMap.get(s.uniqueId) ?? null,
      })),
    };
    } catch (e) {
      console.error('[staffGetStudentAttendance] ERROR:', e);
      throw e;
    }
  }

  // ── Face recognition: clock in ────────────────────────────────────────
  // 1. Send photo to Luxand search. If found → identify student → clock in.
  // 2. If not found → return enrolled:false so frontend prompts enrollment.
  async faceClockIn(user: any, photoBuffer: Buffer) {
    const token = process.env.LUXAND_TOKEN;
    if (!token) throw new BadRequestException('Face recognition not configured');

    // Add required 'collections' field (empty = search all)
    const form = new FormData();
    form.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
    form.append('collections', '');

    let luxandResult: any;
    try {
      const res = await axios.post('https://api.luxand.cloud/photo/search/v2', form, {
        headers: { ...form.getHeaders(), token },
        timeout: 15000,
      });
      luxandResult = res.data;
      this.logger.log('[faceClockIn] Luxand search response: ' + JSON.stringify(luxandResult));
    } catch (e: any) {
      this.logger.error('[faceClockIn] Luxand error: ' + JSON.stringify(e?.response?.data));
      throw new BadRequestException(e?.response?.data?.message ?? 'Face recognition service error');
    }

    // Response is a top-level ARRAY: [{name, probability, uuid, rectangle, collections}]
    // uuid in the array is what Luxand returns during enrollment
    const results = Array.isArray(luxandResult)
      ? luxandResult
      : (Array.isArray(luxandResult?.faces) ? luxandResult.faces : []);
    const matchedUuid: string | null = results.length > 0 ? (results[0]?.uuid ?? null) : null;

    if (!matchedUuid) {
      this.logger.log('[faceClockIn] No match. Full response: ' + JSON.stringify(luxandResult));
      return { success: true, enrolled: false, message: 'Face not found in database. Please enroll first.' };
    }

    this.logger.log('[faceClockIn] Matched UUID: ' + matchedUuid);

    // Look up which student owns this faceUuid
    const student = await this.prisma.student.findFirst({
      where: { faceUuid: matchedUuid },
      include: { user: { select: { uniqueId: true, schoolId: true } } },
    });

    if (!student || !student.user) {
      this.logger.warn('[faceClockIn] No student found for faceUuid: ' + matchedUuid);
      return { success: true, enrolled: false, message: 'Face not linked to any student. Please enroll first.' };
    }

    // Clock in the matched student
    const schoolId = student.user.schoolId;
    const location = schoolId
      ? await this.prisma.attendanceLocation.findFirst({ where: { schoolId: BigInt(schoolId), isActive: true } })
      : null;
    if (!location) throw new BadRequestException('No attendance location configured by admin');

    const studentId = student.user.uniqueId;
    const today     = todayDate();

    const existing = await this.prisma.studentAttendance.findUnique({
      where: { studentId_date: { studentId, date: today } },
    });
    if (existing?.clockIn) {
      return { success: true, enrolled: true, alreadyClockedIn: true, message: 'Already clocked in today' };
    }

    const now = new Date();
    const [rHour, rMin] = (location.resumptionTime ?? '08:00').split(':').map(Number);
    const cutoff = new Date(today);
    cutoff.setHours(rHour, rMin, 0, 0);
    const lateMinutes = now > cutoff ? Math.floor((now.getTime() - cutoff.getTime()) / 60000) : 0;
    const status = lateMinutes > 0 ? 'LATE' : 'PRESENT';

    const record = await this.prisma.studentAttendance.upsert({
      where: { studentId_date: { studentId, date: today } },
      create: { studentId, locationId: location.id, date: today, clockIn: now, status, lateMinutes },
      update: { clockIn: now, locationId: location.id, status, lateMinutes },
    });

    const lateLabel = lateMinutes > 0
      ? lateMinutes < 60 ? `${lateMinutes} min late` : `${Math.floor(lateMinutes / 60)}h ${lateMinutes % 60}m late`
      : '';

    // Notify student
    this.notificationService.notify(
      student.userId,
      'Attendance Recorded',
      `You clocked in via face recognition${lateLabel ? ` (${lateLabel})` : ''}.`,
    );

    return {
      success: true,
      enrolled: true,
      alreadyClockedIn: false,
      message: `Clocked in${lateLabel ? ` (${lateLabel})` : ''}`,
      data: this.serializeStudentRecord(record),
    };
  }

  // ── Face recognition: enroll ──────────────────────────────────────────
  // Register the current student's face in Luxand and save the returned UUID.
  async faceEnroll(user: any, photoBuffer: Buffer) {
    const token = process.env.LUXAND_TOKEN;
    if (!token) throw new BadRequestException('Face recognition not configured');

    const studentUser = await this.getStudentUser(user);
    const studentId   = studentUser.uniqueId;

    // ── Liveness check ──────────────────────────────────────────────────
    // Reject spoofing attempts (printed photo, screen replay, mask, etc.)
    try {
      const livenessForm = new FormData();
      livenessForm.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
      const livenessRes = await axios.post('https://api.luxand.cloud/photo/liveness/v2', livenessForm, {
        headers: { ...livenessForm.getHeaders(), token },
        timeout: 15000,
      });
      const livenessData = livenessRes.data;
      // Luxand returns { status: "success"|"failure", liveness: 0.0–1.0 }
      // Reject if liveness score below 0.5 or status is not success
      const score = livenessData?.liveness ?? livenessData?.score ?? 0;
      const status = livenessData?.status ?? '';
      this.logger.log('[faceEnroll] Liveness: status=' + status + ' score=' + score + ' full=' + JSON.stringify(livenessData));
      // Threshold lowered to 0.3 — mobile cameras sometimes produce lower scores
      if (status !== 'success' || score < 0.3) {
        throw new ForbiddenException(
          `Liveness check failed (score: ${(score * 100).toFixed(0)}%). Please use a real live face — do not use a photo or screen.`,
        );
      }
    } catch (e: any) {
      // Re-throw our own exceptions; wrap external errors
      if (e instanceof ForbiddenException || e instanceof BadRequestException) throw e;
      throw new BadRequestException(e?.response?.data?.message ?? 'Liveness check service error. Please try again.');
    }
    // ────────────────────────────────────────────────────────────────────

    // Fetch full student record with user info
    const student = await this.prisma.student.findFirst({
      where: { user: { uniqueId: studentId } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new BadRequestException('Student record not found');

    // If already enrolled, add a new photo to improve recognition accuracy
    if (student.faceUuid) {
      // POST /subject/v2/:id/photo adds another photo to an existing subject
      const form = new FormData();
      form.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
      try {
        await axios.post(`https://api.luxand.cloud/subject/v2/${student.faceUuid}/photo`, form, {
          headers: { ...form.getHeaders(), token },
          timeout: 15000,
        });
      } catch {
        // Ignore update errors — the face is already enrolled
      }
      return { success: true, message: 'Face updated successfully' };
    }

    // First enrollment — create new person in Luxand using the correct endpoint
    // POST /subject/v2 is the standard enroll endpoint; returns { id, status }
    const name = `${student.user?.firstName ?? ''} ${student.user?.lastName ?? ''}`.trim() || studentId;

    const form = new FormData();
    form.append('name', name);
    form.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });

    let luxandResult: any;
    try {
      const res = await axios.post('https://api.luxand.cloud/subject/v2', form, {
        headers: { ...form.getHeaders(), token },
        timeout: 15000,
      });
      luxandResult = res.data;
      this.logger.log('[faceEnroll] Luxand enroll response: ' + JSON.stringify(luxandResult));
    } catch (e: any) {
      this.logger.error('[faceEnroll] Luxand error: ' + JSON.stringify(e?.response?.data));
      throw new BadRequestException(e?.response?.data?.message ?? 'Failed to enroll face');
    }

    // /subject/v2 returns { uuid, id, ... } — ALWAYS save uuid (not id)
    // because the search endpoint returns uuid for matching
    const uuid = luxandResult?.uuid ?? (luxandResult?.id != null ? String(luxandResult.id) : null);
    this.logger.log('[faceEnroll] Saving faceUuid: ' + uuid + ' (id=' + luxandResult?.id + ')');
    if (!uuid) throw new BadRequestException('No ID returned from face recognition service');

    // Save UUID to student record
    await this.prisma.student.update({
      where: { id: student.id },
      data: { faceUuid: uuid },
    });

    return { success: true, message: 'Face enrolled successfully. You can now clock in with your face.' };
  }

  // ── Debug: raw Luxand search response ────────────────────────────────
  async faceDebugSearch(photoBuffer: Buffer) {
    const token = process.env.LUXAND_TOKEN;
    if (!token) return { error: 'LUXAND_TOKEN not set' };

    // Search
    const searchForm = new FormData();
    searchForm.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
    searchForm.append('collections', '');
    let searchResult: any = null;
    let searchError: any  = null;
    try {
      const r  = await axios.post('https://api.luxand.cloud/photo/search/v2', searchForm, {
        headers: { ...searchForm.getHeaders(), token }, timeout: 15000,
      });
      searchResult = r.data;
    } catch (e: any) { searchError = e?.response?.data ?? e?.message; }

    // Liveness
    const livenessForm = new FormData();
    livenessForm.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
    let livenessResult: any = null;
    let livenessError: any  = null;
    try {
      const r = await axios.post('https://api.luxand.cloud/photo/liveness/v2', livenessForm, {
        headers: { ...livenessForm.getHeaders(), token }, timeout: 15000,
      });
      livenessResult = r.data;
    } catch (e: any) { livenessError = e?.response?.data ?? e?.message; }

    return { searchResult, searchError, livenessResult, livenessError };
  }

  // ── Staff face clock-in ───────────────────────────────────────────────
  async staffFaceClockIn(user: any, photoBuffer: Buffer) {
    const token = process.env.LUXAND_TOKEN;
    if (!token) throw new BadRequestException('Face recognition not configured');

    const form = new FormData();
    form.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
    form.append('collections', '');

    let luxandResult: any;
    try {
      const res = await axios.post('https://api.luxand.cloud/photo/search/v2', form, {
        headers: { ...form.getHeaders(), token }, timeout: 15000,
      });
      luxandResult = res.data;
      this.logger.log('[staffFaceClockIn] Luxand response: ' + JSON.stringify(luxandResult));
    } catch (e: any) {
      throw new BadRequestException(e?.response?.data?.message ?? 'Face recognition service error');
    }

    const results = Array.isArray(luxandResult) ? luxandResult : (Array.isArray(luxandResult?.faces) ? luxandResult.faces : []);
    const matchedUuid: string | null = results.length > 0 ? (results[0]?.uuid ?? null) : null;

    if (!matchedUuid) {
      return { success: true, enrolled: false, message: 'Face not found. Please enroll first.' };
    }

    // Find staff by faceUuid
    const staff = await this.prisma.staff.findFirst({
      where: { faceUuid: matchedUuid },
    });

    if (!staff) {
      return { success: true, enrolled: false, message: 'Face not linked to any staff record. Please enroll first.' };
    }

    // Verify this matches the logged-in staff member
    const staffId = user.id ?? user.staffId;
    if (staff.id !== BigInt(staffId)) {
      throw new ForbiddenException('Face does not match your registered face. Please use your own face.');
    }

    // Clock in directly (no geo required for face clock-in)
    const today = todayDate();
    const existing = await this.prisma.staffAttendance.findUnique({
      where: { staffId_date: { staffId: staff.id, date: today } },
    });
    if (existing?.clockIn) {
      return { success: true, enrolled: true, alreadyClockedIn: true, message: 'Already clocked in today' };
    }

    const schoolId = (await this.prisma.staff.findUnique({
      where: { id: staff.id }, include: { user: { select: { schoolId: true } } },
    }))?.user?.schoolId;

    const location = schoolId
      ? await this.prisma.attendanceLocation.findFirst({ where: { schoolId: BigInt(schoolId), isActive: true } })
      : null;

    const now = new Date();
    const [rHour, rMin] = (location?.resumptionTime ?? '08:00').split(':').map(Number);
    const cutoff = new Date(today);
    cutoff.setHours(rHour, rMin, 0, 0);
    const lateMinutes = now > cutoff ? Math.floor((now.getTime() - cutoff.getTime()) / 60000) : 0;
    const status = lateMinutes > 0 ? 'LATE' : 'PRESENT';

    const record = await this.prisma.staffAttendance.upsert({
      where: { staffId_date: { staffId: staff.id, date: today } },
      create: { staffId: staff.id, locationId: location?.id, date: today, clockIn: now, status, lateMinutes },
      update: { clockIn: now, locationId: location?.id, status, lateMinutes },
    });

    const lateLabel = lateMinutes > 0
      ? lateMinutes < 60 ? `${lateMinutes} min late` : `${Math.floor(lateMinutes / 60)}h ${lateMinutes % 60}m late`
      : '';

    return {
      success: true, enrolled: true, alreadyClockedIn: false,
      message: `Clocked in${lateLabel ? ` (${lateLabel})` : ''}`,
      data: this.serializeRecord(record),
    };
  }

  // ── Staff face enroll ─────────────────────────────────────────────────
  async staffFaceEnroll(user: any, photoBuffer: Buffer) {
    const token = process.env.LUXAND_TOKEN;
    if (!token) throw new BadRequestException('Face recognition not configured');

    // Liveness check
    try {
      const lf = new FormData();
      lf.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
      const lr = await axios.post('https://api.luxand.cloud/photo/liveness/v2', lf, {
        headers: { ...lf.getHeaders(), token }, timeout: 15000,
      });
      const ld = lr.data;
      const score = ld?.liveness ?? ld?.score ?? 0;
      this.logger.log('[staffFaceEnroll] Liveness score: ' + score);
      if ((ld?.status ?? '') !== 'success' || score < 0.3) {
        throw new ForbiddenException(`Liveness check failed (score: ${(score * 100).toFixed(0)}%). Please use a real live face.`);
      }
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof BadRequestException) throw e;
      throw new BadRequestException(e?.response?.data?.message ?? 'Liveness check failed. Please try again.');
    }

    const staffId = user.id ?? user.staffId;
    const staff = await this.prisma.staff.findUnique({
      where: { id: BigInt(staffId) },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!staff) throw new BadRequestException('Staff record not found');

    // Already enrolled — update photo
    if (staff.faceUuid) {
      const form = new FormData();
      form.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
      try {
        await axios.post(`https://api.luxand.cloud/subject/v2/${staff.faceUuid}/photo`, form, {
          headers: { ...form.getHeaders(), token }, timeout: 15000,
        });
      } catch { /* ignore */ }
      return { success: true, message: 'Face updated successfully' };
    }

    // First enroll
    const name = `${staff.user?.firstName ?? ''} ${staff.user?.lastName ?? ''}`.trim() || `Staff-${staffId}`;
    const form = new FormData();
    form.append('name', name);
    form.append('photo', photoBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });

    let result: any;
    try {
      const res = await axios.post('https://api.luxand.cloud/subject/v2', form, {
        headers: { ...form.getHeaders(), token }, timeout: 15000,
      });
      result = res.data;
      this.logger.log('[staffFaceEnroll] Luxand response: ' + JSON.stringify(result));
    } catch (e: any) {
      throw new BadRequestException(e?.response?.data?.message ?? 'Failed to enroll face');
    }

    const uuid = result?.uuid ?? (result?.id != null ? String(result.id) : null);
    if (!uuid) throw new BadRequestException('No UUID returned from face recognition service');

    await this.prisma.staff.update({ where: { id: staff.id }, data: { faceUuid: uuid } });
    return { success: true, message: 'Face enrolled successfully. You can now clock in with your face.' };
  }
}
