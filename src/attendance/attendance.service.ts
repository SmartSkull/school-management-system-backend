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
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
    const { date, month, year, staffId } = query;

    const where: any = {
      staff: { user: { schoolId: BigInt(schoolId) } },
    };

    if (staffId) where.staffId = BigInt(staffId);

    if (date) {
      const d = new Date(date);
      where.date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } else if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = new Date(Number(year), Number(month), 1);
      where.date = { gte: start, lt: end };
    } else {
      // default: today
      where.date = todayDate();
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
}
