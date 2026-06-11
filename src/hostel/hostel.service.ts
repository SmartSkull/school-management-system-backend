import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HostelService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  // ── Hostels ──────────────────────────────────────────────────────────────

  async getHostels(user: any) {
    const schoolId = this.schoolId(user);
    const hostels = await this.prisma.hostel.findMany({
      where: schoolId ? { schoolId } : {},
      include: { rooms: { include: { beds: { include: { student: { include: { user: true } } } } } } },
      orderBy: { name: 'asc' },
    });
    return this.ok(hostels);
  }

  async createHostel(user: any, body: { name: string; gender?: string; capacity?: number }) {
    const schoolId = this.schoolId(user);
    const hostel = await this.prisma.hostel.create({
      data: { name: body.name, gender: body.gender ?? 'MIXED', capacity: body.capacity ?? 0, ...(schoolId ? { schoolId } : {}) },
    });
    return this.ok(hostel, 'Hostel created');
  }

  async updateHostel(id: string, body: { name?: string; gender?: string; capacity?: number }) {
    const hostel = await this.prisma.hostel.findUnique({ where: { id: BigInt(id) } });
    if (!hostel) throw new NotFoundException('Hostel not found');
    return this.ok(await this.prisma.hostel.update({ where: { id: BigInt(id) }, data: body }), 'Hostel updated');
  }

  async deleteHostel(id: string) {
    const hostel = await this.prisma.hostel.findUnique({ where: { id: BigInt(id) } });
    if (!hostel) throw new NotFoundException('Hostel not found');
    await this.prisma.hostel.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Hostel deleted');
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  async createRoom(body: { hostelId: string; name: string; capacity?: number }) {
    const hostel = await this.prisma.hostel.findUnique({ where: { id: BigInt(body.hostelId) } });
    if (!hostel) throw new NotFoundException('Hostel not found');
    const room = await this.prisma.hostelRoom.create({
      data: { hostelId: BigInt(body.hostelId), name: body.name, capacity: body.capacity ?? 4 },
    });
    // auto-create beds
    const count = body.capacity ?? 4;
    await this.prisma.hostelBed.createMany({
      data: Array.from({ length: count }, (_, i) => ({ roomId: room.id, bedNumber: `Bed ${i + 1}` })),
    });
    return this.ok(room, 'Room created');
  }

  async deleteRoom(id: string) {
    const room = await this.prisma.hostelRoom.findUnique({ where: { id: BigInt(id) } });
    if (!room) throw new NotFoundException('Room not found');
    await this.prisma.hostelRoom.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Room deleted');
  }

  // ── Bed allocation ────────────────────────────────────────────────────────

  async assignBed(bedId: string, studentUniqueId: string, user: any) {
    const schoolId = this.schoolId(user);
    const bed = await this.prisma.hostelBed.findUnique({ where: { id: BigInt(bedId) } });
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.studentId) throw new BadRequestException('Bed already occupied');

    const student = await this.prisma.student.findFirst({
      where: { user: { uniqueId: studentUniqueId, ...(schoolId ? { schoolId } : {}) } },
    });
    if (!student) throw new NotFoundException('Student not found');

    // unassign previous bed if any
    await this.prisma.hostelBed.updateMany({ where: { studentId: student.id }, data: { studentId: null, assignedAt: null } });

    await this.prisma.hostelBed.update({
      where: { id: BigInt(bedId) },
      data: { studentId: student.id, assignedAt: new Date() },
    });
    return this.ok(null, 'Bed assigned');
  }

  async unassignBed(bedId: string) {
    const bed = await this.prisma.hostelBed.findUnique({ where: { id: BigInt(bedId) } });
    if (!bed) throw new NotFoundException('Bed not found');
    await this.prisma.hostelBed.update({ where: { id: BigInt(bedId) }, data: { studentId: null, assignedAt: null } });
    return this.ok(null, 'Bed unassigned');
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  async getAttendance(user: any, date?: string) {
    const schoolId = this.schoolId(user);
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const students = await this.prisma.student.findMany({
      where: { hostelBed: { isNot: null }, ...(schoolId ? { user: { schoolId } } : {}) },
      include: { user: true, hostelBed: { include: { room: { include: { hostel: true } } } } },
    });

    const records = await this.prisma.hostelAttendance.findMany({
      where: { date: targetDate, ...(schoolId ? { student: { user: { schoolId } } } : {}) },
    });
    const recordMap = new Map(records.map(r => [r.studentId.toString(), r]));

    return this.ok(students.map(s => ({
      studentId: s.user.uniqueId,
      name: `${s.user.firstName} ${s.user.lastName}`,
      hostel: s.hostelBed?.room.hostel.name,
      room: s.hostelBed?.room.name,
      bed: s.hostelBed?.bedNumber,
      present: recordMap.get(s.id.toString())?.present ?? null,
      note: recordMap.get(s.id.toString())?.note ?? null,
    })));
  }

  async getStudentHostelInfo(user: any) {
    const student = await this.prisma.student.findFirst({
      where: { userId: BigInt(user.id ?? user.userId ?? user.authUserId) },
      include: {
        hostelBed: {
          include: {
            room: {
              include: {
                hostel: true,
                beds: { include: { student: { include: { user: true } } } },
              },
            },
          },
        },
      },
    });
    if (!student?.hostelBed) return this.ok(null, 'No hostel assignment');
    const bed = student.hostelBed;
    const roommates = bed.room.beds
      .filter((b) => b.studentId && b.studentId !== student.id)
      .map((b) => ({ name: `${b.student!.user.firstName} ${b.student!.user.lastName}`, bed: b.bedNumber }));
    return this.ok({
      hostel: bed.room.hostel.name,
      block: bed.room.hostel.gender,
      room: bed.room.name,
      bed: bed.bedNumber,
      roommates,
    });
  }

  async markAttendance(user: any, body: { date: string; records: { studentUniqueId: string; present: boolean; note?: string }[] }) {
    const schoolId = this.schoolId(user);
    const date = new Date(body.date);
    date.setHours(0, 0, 0, 0);

    for (const r of body.records) {
      const student = await this.prisma.student.findFirst({
        where: { user: { uniqueId: r.studentUniqueId, ...(schoolId ? { schoolId } : {}) } },
      });
      if (!student) continue;
      await this.prisma.hostelAttendance.upsert({
        where: { studentId_date: { studentId: student.id, date } },
        update: { present: r.present, note: r.note ?? null },
        create: { studentId: student.id, date, present: r.present, note: r.note ?? null },
      });
    }
    return this.ok(null, 'Attendance saved');
  }
}
