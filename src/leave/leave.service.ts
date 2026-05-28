import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../common/email.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LeaveService {
  constructor(private prisma: PrismaService, private emailService: EmailService) {}

  // ── Staff: request leave ───────────────────────────────────────────────
  async requestLeave(user: any, body: any, file?: Express.Multer.File) {
    const staffId = user.id ?? user.staffId;
    const { type, startDate, endDate, reason } = body;

    if (!startDate || !endDate || !reason) {
      throw new BadRequestException('startDate, endDate and reason are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) throw new BadRequestException('endDate must be after startDate');

    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

    const staff = await this.prisma.staff.findUnique({
      where: { id: BigInt(staffId) },
      include: { user: { include: { school: { select: { id: true, name: true } } } } },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const leave = await this.prisma.leaveRequest.create({
      data: {
        staffId: BigInt(staffId),
        type: type ?? 'OTHER',
        startDate: start,
        endDate: end,
        days,
        reason,
        proofFile: file ? file.filename : null,
        status: 'PENDING',
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', schoolId: staff.user.schoolId, email: { not: '' } },
      select: { firstName: true, lastName: true, email: true },
    });
    const staffName = `${staff.user.firstName} ${staff.user.lastName}`.trim();
    for (const admin of admins) {
      this.emailService.sendLeaveRequestedAdmin({
        adminEmail: admin.email,
        adminName: `${admin.firstName} ${admin.lastName}`.trim(),
        staffName,
        staffNo: staff.staffNo,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        schoolName: staff.user.school?.name ?? 'School',
        hasProofFile: Boolean(leave.proofFile),
      }).catch(() => {});
    }

    return { success: true, message: 'Leave request submitted', data: this.serialize(leave) };
  }

  // ── Staff: own leave requests ──────────────────────────────────────────
  async myLeaves(user: any) {
    const staffId = user.id ?? user.staffId;
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { staffId: BigInt(staffId) },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: leaves.map((l) => this.serialize(l)) };
  }

  // ── Staff: leave balance ───────────────────────────────────────────────
  async myBalance(user: any) {
    const staffId = user.id ?? user.staffId;
    const schoolId = user.schoolId ?? user.user?.schoolId;
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const [approved, entitlements] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { staffId: BigInt(staffId), status: 'APPROVED', startDate: { gte: start, lt: end } },
      }),
      schoolId
        ? this.prisma.leaveEntitlement.findMany({ where: { schoolId: BigInt(schoolId) } })
        : [],
    ]);

    const used: Record<string, number> = {};
    for (const l of approved) used[l.type] = (used[l.type] ?? 0) + l.days;

    const DEFAULTS: Record<string, number> = { ANNUAL: 21, SICK: 14, MATERNITY: 90, PATERNITY: 5, UNPAID: 0, OTHER: 0 };
    const entitled: Record<string, number> = { ...DEFAULTS };
    for (const e of entitlements) entitled[e.type] = e.days;

    const balance = Object.entries(entitled).map(([type, days]) => ({
      type, entitled: days, used: used[type] ?? 0, remaining: Math.max(0, days - (used[type] ?? 0)),
    }));

    return { success: true, data: balance };
  }

  // ── Admin: all leave requests ──────────────────────────────────────────
  async getAllLeaves(user: any, query: any) {
    const schoolId = user.schoolId ?? user.school?.id;
    const { status, staffId } = query;

    const where: any = {
      staff: { user: { schoolId: BigInt(schoolId) } },
    };
    if (status) where.status = status;
    if (staffId) where.staffId = BigInt(staffId);

    const leaves = await this.prisma.leaveRequest.findMany({
      where,
      include: { staff: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: leaves.map((l) => ({
        ...this.serialize(l),
        staff: {
          id: l.staff.id.toString(),
          name: `${l.staff.user.firstName} ${l.staff.user.lastName}`,
          staffNo: l.staff.staffNo,
          image: l.staff.user.image,
        },
      })),
    };
  }

  // ── Admin: approve / reject ────────────────────────────────────────────
  async reviewLeave(user: any, id: string, body: { status: 'APPROVED' | 'REJECTED'; adminNote?: string }) {
    const { status, adminNote } = body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }

    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: BigInt(id) },
      include: { staff: { include: { user: { include: { school: { select: { name: true } } } } } } },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') throw new BadRequestException('Only pending requests can be reviewed');

    const updated = await this.prisma.leaveRequest.update({
      where: { id: BigInt(id) },
      data: { status, adminNote: adminNote ?? null, reviewedAt: new Date(), reviewedBy: BigInt(user.authUserId ?? user.id) },
    });

    this.emailService.sendLeaveReviewed({
      email: leave.staff.user.email,
      staffName: `${leave.staff.user.firstName} ${leave.staff.user.lastName}`.trim(),
      status,
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      adminNote,
      schoolName: leave.staff.user.school?.name ?? 'School',
    }).catch(() => {});

    return { success: true, message: `Leave ${status.toLowerCase()}`, data: this.serialize(updated) };
  }

  // ── Admin: staff leave balance ─────────────────────────────────────────
  async staffBalance(user: any, staffId: string) {
    const schoolId = user.schoolId ?? user.school?.id;
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const [approved, entitlements] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { staffId: BigInt(staffId), status: 'APPROVED', startDate: { gte: start, lt: end } },
      }),
      this.prisma.leaveEntitlement.findMany({ where: { schoolId: BigInt(schoolId) } }),
    ]);

    const used: Record<string, number> = {};
    for (const l of approved) used[l.type] = (used[l.type] ?? 0) + l.days;

    const DEFAULTS: Record<string, number> = { ANNUAL: 21, SICK: 14, MATERNITY: 90, PATERNITY: 5, UNPAID: 0, OTHER: 0 };
    const entitled: Record<string, number> = { ...DEFAULTS };
    for (const e of entitlements) entitled[e.type] = e.days;

    const balance = Object.entries(entitled).map(([type, days]) => ({
      type, entitled: days, used: used[type] ?? 0, remaining: Math.max(0, days - (used[type] ?? 0)),
    }));

    return { success: true, data: balance };
  }

  // ── Admin: get entitlements ────────────────────────────────────────────
  async getEntitlements(user: any) {
    const schoolId = user.schoolId ?? user.school?.id;
    const rows = await this.prisma.leaveEntitlement.findMany({ where: { schoolId: BigInt(schoolId) } });

    const DEFAULTS: Record<string, number> = { ANNUAL: 21, SICK: 14, MATERNITY: 90, PATERNITY: 5, UNPAID: 0, OTHER: 0 };
    const saved: Record<string, number> = {};
    for (const r of rows) saved[r.type] = r.days;

    const data = Object.entries(DEFAULTS).map(([type, def]) => ({
      type, days: saved[type] ?? def,
    }));
    return { success: true, data };
  }

  // ── Admin: upsert entitlement ──────────────────────────────────────────
  async setEntitlement(user: any, body: { type: string; days: number }) {
    const schoolId = user.schoolId ?? user.school?.id;
    const { type, days } = body;
    if (days == null || days < 0) throw new Error('days must be >= 0');

    const row = await this.prisma.leaveEntitlement.upsert({
      where: { schoolId_type: { schoolId: BigInt(schoolId), type: type as any } },
      create: { schoolId: BigInt(schoolId), type: type as any, days: Number(days) },
      update: { days: Number(days) },
    });
    return { success: true, data: { type: row.type, days: row.days } };
  }

  private serialize(l: any) {
    return {
      id: l.id.toString(),
      staffId: l.staffId.toString(),
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.days,
      reason: l.reason,
      proofFile: l.proofFile ?? null,
      status: l.status,
      adminNote: l.adminNote ?? null,
      reviewedAt: l.reviewedAt ?? null,
      createdAt: l.createdAt,
    };
  }
}
