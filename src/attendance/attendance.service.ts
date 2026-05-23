import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// Haversine distance in metres
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
  constructor(private prisma: PrismaService) {}

  // ── Staff: clock in ────────────────────────────────────────────────────
  async clockIn(user: any, body: { latitude: number; longitude: number }) {
    const { latitude, longitude } = body;
    if (latitude == null || longitude == null) throw new BadRequestException('Location required');

    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    // Find active location for this school
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

    // Determine if late based on admin-configured resumption time
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
      },
      update: { clockIn: now, locationId: location.id, status, lateMinutes },
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
    const date = body.date ? new Date(body.date) : todayDate();
    const dayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

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
  async studentClockIn(user: any, body: { latitude: number; longitude: number }) {
    const { latitude, longitude } = body;
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

    // studentId in StudentAttendance is User.id directly
    const studentId = BigInt(user.id);
    const today = todayDate();

    const existing = await this.prisma.studentAttendance.findUnique({
      where: { studentId_date: { studentId, date: today } },
    });
    if (existing?.clockIn) throw new BadRequestException('Already clocked in today');

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
      ? lateMinutes < 60 ? `${lateMinutes} min late` : `${Math.floor(lateMinutes / 60)}h ${lateMinutes % 60 ? `${lateMinutes % 60}m ` : ''}late`
      : '';
    return { success: true, message: `Clocked in${lateLabel ? ` (${lateLabel})` : ''}`, data: this.serializeStudentRecord(record) };
  }

  // ── Student: clock out ────────────────────────────────────────────────
  async studentClockOut(user: any, body: { latitude: number; longitude: number }) {
    const { latitude, longitude } = body;
    if (latitude == null || longitude == null) throw new BadRequestException('Location required');

    const studentId = BigInt(user.id);
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
    return { success: true, message: 'Clocked out successfully', data: this.serializeStudentRecord(updated) };
  }

  // ── Student: today status ─────────────────────────────────────────────
  async studentTodayStatus(user: any) {
    const studentId = BigInt(user.id);
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
    const studentId = BigInt(user.id);
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

    // studentId in StudentAttendance is User.id directly
    // Get all user IDs belonging to this school
    const schoolUsers = await this.prisma.user.findMany({
      where: { schoolId: BigInt(schoolId), role: 'STUDENT' },
      select: { id: true },
    });
    const userIds = schoolUsers.map(u => u.id);
    const where: any = { studentId: { in: userIds } };

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

    const records = await this.prisma.studentAttendance.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    // Fetch User info for each record (studentId = User.id)
    const uniqueUserIds = [...new Set(records.map(r => r.studentId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, firstName: true, lastName: true, uniqueId: true, image: true },
    });
    const userMap = new Map(users.map(u => [u.id.toString(), u]));

    return {
      success: true,
      data: records.map((r) => {
        const u = userMap.get(r.studentId.toString());
        return {
          ...this.serializeStudentRecord(r),
          student: {
            id: r.studentId.toString(),
            name: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
            studentNo: u?.uniqueId ?? '',
            image: u?.image ?? null,
          },
        };
      }),
    };
  }

  // ── Admin: mark absent students who haven't clocked in ────────────────
  async markStudentsAbsent(user: any, body: { date?: string }) {
    const schoolId = user.schoolId ?? user.school?.id;
    const date = body.date ? new Date(body.date) : todayDate();
    const dayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const allStudents = await this.prisma.student.findMany({
      where: { user: { schoolId: BigInt(schoolId), status: 'ACTIVE' } },
    });

    const existing = await this.prisma.studentAttendance.findMany({
      where: { date: dayDate, student: { user: { schoolId: BigInt(schoolId) } } },
      select: { studentId: true },
    });
    const presentIds = new Set(existing.map((e) => e.studentId.toString()));
    const absent = allStudents.filter((s) => !presentIds.has(s.id.toString()));

    if (absent.length > 0) {
      await this.prisma.studentAttendance.createMany({
        data: absent.map((s) => ({ studentId: s.id, date: dayDate, status: 'ABSENT' as const, lateMinutes: 0 })),
        skipDuplicates: true,
      });
    }
    return { success: true, message: `${absent.length} students marked absent` };
  }

  private serializeStudentRecord(r: any) {
    return {
      id: r.id.toString(),
      studentId: r.studentId.toString(),
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

  // ── Staff: mark student attendance for their class ────────────────────
  async staffMarkStudentAttendance(user: any, body: { date?: string; students: { uniqueId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' }[] }) {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    if (!schoolId) throw new ForbiddenException('No school associated');

    const date = body.date ? new Date(body.date) : todayDate();
    const uniqueIds = body.students.map(s => s.uniqueId);

    const users = await this.prisma.user.findMany({
      where: { uniqueId: { in: uniqueIds }, schoolId: BigInt(schoolId), role: 'STUDENT' },
      select: { uniqueId: true, student: { select: { id: true } } },
    });
    const userMap = new Map(users.map(u => [u.uniqueId, u.student?.id]));

    for (const s of body.students) {
      const studentId = userMap.get(s.uniqueId);
      if (!studentId) continue;
      await this.prisma.studentAttendance.upsert({
        where: { studentId_date: { studentId, date } },
        create: { studentId, date, status: s.status, lateMinutes: 0 },
        update: { status: s.status },
      });
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
      where: { schoolId: BigInt(schoolId), role: 'STUDENT', student: { classRoom: { name: resolvedClass } } },
      select: { id: true, uniqueId: true, firstName: true, lastName: true, image: true, student: { select: { id: true } } },
    });

    const validStudents = students.filter(s => s.student != null);
    const targetDate = date ? new Date(date) : todayDate();
    const records = validStudents.length ? await this.prisma.studentAttendance.findMany({
      where: { studentId: { in: validStudents.map(s => s.student!.id) }, date: targetDate },
    }) : [];
    const recordMap = new Map(records.map(r => [r.studentId.toString(), r.status]));

    return {
      success: true,
      data: validStudents.map(s => ({
        uniqueId: s.uniqueId,
        firstname: s.firstName,
        lastname: s.lastName,
        image: s.image,
        status: recordMap.get(s.student!.id.toString()) ?? null,
      })),
    };
    } catch (e) {
      console.error('[staffGetStudentAttendance] ERROR:', e);
      throw e;
    }
  }
}
