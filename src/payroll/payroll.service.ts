import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint {
    const id = user?.schoolId ?? user?.school?.id ?? user?.user?.schoolId;
    if (!id) throw new ForbiddenException('School context is required');
    return BigInt(id);
  }

  private staffId(user: any): bigint {
    // For staff role, req.user is the Staff record (id = staff.id)
    // For admin acting on behalf, staffId may be explicitly set
    const id = user?.staffId ?? user?.id;
    if (!id || user?.role === 'admin') throw new ForbiddenException('Staff context is required');
    return BigInt(id);
  }

  private money(value: any, field: string, required = false): number {
    if ((value === undefined || value === null || value === '') && !required) return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`${field} must be a positive number`);
    return Math.round(n * 100) / 100;
  }

  private percent(value: any, field: string): number {
    const n = this.money(value ?? 0, field);
    if (n > 100) throw new BadRequestException(`${field} cannot be more than 100`);
    return n;
  }

  private period(body: any) {
    const now = new Date();
    const month = Number(body?.month ?? now.getMonth() + 1);
    const year = Number(body?.year ?? now.getFullYear());
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException('month must be 1-12');
    if (!Number.isInteger(year) || year < 2000) throw new BadRequestException('year is invalid');
    return { month, year };
  }

  async getSalarySetups(user: any) {
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findMany({
      where: { user: { schoolId } },
      include: { user: true, salarySetup: true },
      orderBy: { user: { firstName: 'asc' } },
    });

    return this.ok(staff.map((s) => ({
      staffId: s.id.toString(),
      staffNo: s.staffNo,
      name: `${s.user.firstName} ${s.user.lastName}`,
      image: s.user.image,
      setup: s.salarySetup ? this.serializeSalarySetup(s.salarySetup) : null,
    })));
  }

  async saveSalarySetup(user: any, staffId: string, body: any) {
    const schoolId = this.schoolId(user);
    const staff = await this.prisma.staff.findFirst({
      where: { id: BigInt(staffId), user: { schoolId } },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const basicSalary = this.money(body.basicSalary, 'basicSalary', true);
    const data = {
      basicSalary,
      housingAllowance: this.money(body.housingAllowance, 'housingAllowance'),
      transportAllowance: this.money(body.transportAllowance, 'transportAllowance'),
      otherAllowance: this.money(body.otherAllowance, 'otherAllowance'),
      taxRate: this.percent(body.taxRate, 'taxRate'),
      pensionRate: this.percent(body.pensionRate, 'pensionRate'),
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
    };

    const setup = await this.prisma.payrollSalarySetup.upsert({
      where: { staffId: staff.id },
      create: { staffId: staff.id, ...data },
      update: data,
    });

    return this.ok(this.serializeSalarySetup(setup), 'Salary setup saved');
  }

  async getDeductions(user: any, query: any) {
    const schoolId = this.schoolId(user);
    const where: any = { schoolId };

    // Build staff filter: include school-wide (staffId=null) + specific staff if requested
    if (query.staffId) {
      where.OR = [
        { staffId: null },
        { staffId: BigInt(query.staffId) },
      ];
    }

    // Narrow by period: recurring always included, non-recurring only if month/year match
    if (query.month) {
      const month = Number(query.month);
      const year = Number(query.year);
      const periodFilter = [{ recurring: true }, { recurring: false, month, year }];
      if (where.OR) {
        // Combine: (staffId filter) AND (period filter)
        const staffFilter = where.OR;
        delete where.OR;
        where.AND = [{ OR: staffFilter }, { OR: periodFilter }];
      } else {
        where.OR = periodFilter;
      }
    }

    const rows = await this.prisma.payrollDeduction.findMany({
      where,
      include: { staff: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return this.ok(rows.map((d) => this.serializeDeduction(d)));
  }

  async createDeduction(user: any, body: any) {
    const schoolId = this.schoolId(user);
    const amount = this.money(body.amount, 'amount', true);
    if (!body.title?.trim()) throw new BadRequestException('title is required');
    if (body.staffId) await this.ensureStaffInSchool(schoolId, body.staffId);

    const recurring = Boolean(body.recurring);
    const data: any = {
      schoolId,
      staffId: body.staffId ? BigInt(body.staffId) : null,
      title: body.title.trim(),
      amount,
      recurring,
      note: body.note?.trim() || null,
    };
    if (!recurring) {
      const { month, year } = this.period(body);
      data.month = month;
      data.year = year;
    }

    const row = await this.prisma.payrollDeduction.create({ data, include: { staff: { include: { user: true } } } });
    return this.ok(this.serializeDeduction(row), 'Deduction added');
  }

  async deleteDeduction(user: any, id: string) {
    const schoolId = this.schoolId(user);
    const row = await this.prisma.payrollDeduction.findFirst({ where: { id: BigInt(id), schoolId } });
    if (!row) throw new NotFoundException('Deduction not found');
    await this.prisma.payrollDeduction.delete({ where: { id: row.id } });
    return this.ok(null, 'Deduction deleted');
  }

  async getPayslips(user: any, query: any) {
    const schoolId = this.schoolId(user);
    const where: any = { staff: { user: { schoolId } } };
    if (query.month) where.month = Number(query.month);
    if (query.year) where.year = Number(query.year);
    if (query.staffId) where.staffId = BigInt(query.staffId);

    const rows = await this.prisma.payrollPayslip.findMany({
      where,
      include: { staff: { include: { user: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
    });
    return this.ok(rows.map((p) => this.serializePayslip(p)));
  }

  async getMyPayslips(user: any, query: any) {
    const staffId = this.staffId(user);
    const where: any = { staffId };
    if (query.month) where.month = Number(query.month);
    if (query.year) where.year = Number(query.year);
    const rows = await this.prisma.payrollPayslip.findMany({
      where,
      include: { staff: { include: { user: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return this.ok(rows.map((p) => this.serializePayslip(p)));
  }

  async runPayroll(user: any, body: any) {
    const schoolId = this.schoolId(user);
    const { month, year } = this.period(body);
    const staffWhere: any = { user: { schoolId }, salarySetup: { isNot: null } };
    if (body.staffId) staffWhere.id = BigInt(body.staffId);

    const staff = await this.prisma.staff.findMany({
      where: staffWhere,
      include: { user: true, salarySetup: true },
    });
    if (!staff.length) throw new BadRequestException('No salary setup found for selected staff');

    const deductions = await this.prisma.payrollDeduction.findMany({
      where: {
        schoolId,
        OR: [
          { recurring: true },
          { recurring: false, month, year },
        ],
      },
    });

    const payslips = [];
    for (const member of staff) {
      const setup = member.salarySetup!;
      const staffDeductions = deductions.filter((d) => d.staffId === null || d.staffId.toString() === member.id.toString());
      const calculated = this.calculate(setup, staffDeductions);

      const payslip = await this.prisma.payrollPayslip.upsert({
        where: { staffId_month_year: { staffId: member.id, month, year } },
        create: { staffId: member.id, month, year, ...calculated, status: 'ISSUED', generatedAt: new Date() },
        update: { ...calculated, status: 'ISSUED', generatedAt: new Date() },
        include: { staff: { include: { user: true } } },
      });
      payslips.push(this.serializePayslip(payslip));
    }

    return this.ok({ count: payslips.length, payslips }, 'Payroll calculated');
  }

  async updatePayslipStatus(user: any, id: string, status: string) {
    const schoolId = this.schoolId(user);
    if (!['DRAFT', 'ISSUED', 'PAID'].includes(status)) throw new BadRequestException('Invalid status');
    const payslip = await this.prisma.payrollPayslip.findFirst({
      where: { id: BigInt(id), staff: { user: { schoolId } } },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');
    const updated = await this.prisma.payrollPayslip.update({
      where: { id: payslip.id },
      data: { status: status as any },
      include: { staff: { include: { user: true } } },
    });
    return this.ok(this.serializePayslip(updated), 'Payslip updated');
  }

  private calculate(setup: any, deductions: any[]) {
    const basicSalary = Number(setup.basicSalary);
    const housingAllowance = Number(setup.housingAllowance);
    const transportAllowance = Number(setup.transportAllowance);
    const otherAllowance = Number(setup.otherAllowance);
    const grossPay = basicSalary + housingAllowance + transportAllowance + otherAllowance;
    const taxAmount = this.round(grossPay * (Number(setup.taxRate) / 100));
    const pensionAmount = this.round(grossPay * (Number(setup.pensionRate) / 100));
    const extraDeductions = this.round(deductions.reduce((sum, d) => sum + Number(d.amount), 0));
    const totalDeductions = this.round(taxAmount + pensionAmount + extraDeductions);
    const netPay = this.round(Math.max(0, grossPay - totalDeductions));
    return {
      basicSalary: this.round(basicSalary),
      housingAllowance: this.round(housingAllowance),
      transportAllowance: this.round(transportAllowance),
      otherAllowance: this.round(otherAllowance),
      grossPay: this.round(grossPay),
      taxAmount,
      pensionAmount,
      deductions: extraDeductions,
      netPay,
    };
  }

  private async ensureStaffInSchool(schoolId: bigint, staffId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: BigInt(staffId), user: { schoolId } } });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }

  private serializeSalarySetup(setup: any) {
    return {
      id: setup.id.toString(),
      staffId: setup.staffId.toString(),
      basicSalary: Number(setup.basicSalary),
      housingAllowance: Number(setup.housingAllowance),
      transportAllowance: Number(setup.transportAllowance),
      otherAllowance: Number(setup.otherAllowance),
      taxRate: Number(setup.taxRate),
      pensionRate: Number(setup.pensionRate),
      effectiveFrom: setup.effectiveFrom,
      createdAt: setup.createdAt,
      updatedAt: setup.updatedAt,
    };
  }

  private serializeDeduction(d: any) {
    return {
      id: d.id.toString(),
      schoolId: d.schoolId.toString(),
      staffId: d.staffId?.toString() ?? null,
      staffName: d.staff ? `${d.staff.user.firstName} ${d.staff.user.lastName}` : 'All staff',
      title: d.title,
      amount: Number(d.amount),
      recurring: d.recurring,
      month: d.month,
      year: d.year,
      note: d.note,
      createdAt: d.createdAt,
    };
  }

  private serializePayslip(p: any) {
    const staffName = p.staff ? `${p.staff.user.firstName} ${p.staff.user.lastName}` : '';
    return {
      id: p.id.toString(),
      staffId: p.staffId.toString(),
      staffName,
      staffNo: p.staff?.staffNo ?? '',
      image: p.staff?.user?.image ?? null,
      month: p.month,
      year: p.year,
      basicSalary: Number(p.basicSalary),
      housingAllowance: Number(p.housingAllowance),
      transportAllowance: Number(p.transportAllowance),
      otherAllowance: Number(p.otherAllowance),
      grossPay: Number(p.grossPay),
      taxAmount: Number(p.taxAmount),
      pensionAmount: Number(p.pensionAmount),
      deductions: Number(p.deductions),
      netPay: Number(p.netPay),
      status: p.status,
      generatedAt: p.generatedAt,
      createdAt: p.createdAt,
    };
  }
}
