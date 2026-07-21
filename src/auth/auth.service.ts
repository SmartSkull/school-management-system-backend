import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../common/email.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private emailService: EmailService) {}

  async studentLogin(name: string, password: string, schoolSlug?: string) {
    if (!name || !password) throw new UnauthorizedException('Invalid credentials');
    const schoolId = await this.resolveSchoolId(schoolSlug);
    const defaultPassword = await this.getDefaultPassword(schoolId);

    const nameTrimmed = name.trim();
    const parts = nameTrimmed.split(' ');
    const first = parts[0];

    let users: any[];
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      users = await this.prisma.user.findMany({
        where: {
          role: 'STUDENT',
          ...(schoolId ? { schoolId } : {}),
          OR: [
            { firstName: { startsWith: first }, lastName: { startsWith: last } },
            { firstName: { startsWith: last }, lastName: { startsWith: first } },
            { uniqueId: nameTrimmed },
          ],
        },
        take: 20,
      });
    } else {
      users = await this.prisma.user.findMany({
        where: {
          role: 'STUDENT',
          ...(schoolId ? { schoolId } : {}),
          OR: [
            { firstName: { startsWith: first } },
            { lastName: { startsWith: first } },
            { uniqueId: nameTrimmed },
          ],
        },
        take: 20,
      });
    }

    const nameLower = nameTrimmed.toLowerCase();
    let user: any = null;

    for (const row of users) {
      const fullName = `${row.firstName} ${row.lastName}`.toLowerCase();
      const uniqueId = row.uniqueId?.toLowerCase();
      if (fullName !== nameLower && uniqueId !== nameLower) continue;
      const passwordMatches = await this.verifyStudentPassword(password, row, defaultPassword);
      if (passwordMatches) { user = row; break; }
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.buildTokenResponse(user, 'student', user.uniqueId);
  }

  private async verifyStudentPassword(input: string, row: any, defaultPassword: string): Promise<boolean> {
    if (input.toLowerCase() === row.lastName.toLowerCase()) return true;
    if (row.password) {
      try { if (await bcrypt.compare(input, row.password)) return true; } catch {}
      if (input === row.password) return true;
    }
    if (input === defaultPassword) return true;
    return false;
  }

  async staffLogin(staffId: string, password: string, schoolSlug?: string) {
    const schoolId = await this.resolveSchoolId(schoolSlug);
    const defaultPassword = await this.getDefaultPassword(schoolId);
    const user = await this.prisma.user.findFirst({
      where: {
        role: 'STAFF',
        ...(schoolId ? { schoolId } : {}),
        OR: [{ uniqueId: staffId }, { email: staffId }, { telephone: staffId }],
      },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await this.verifyPassword(password, user.password, defaultPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const driverRecord = await this.prisma.transportDriver.findFirst({ where: { userId: user.id }, select: { id: true } });
    return this.buildTokenResponse(user, 'staff', user.uniqueId, !!driverRecord);
  }

  async adminLogin(adminId: string, password: string, schoolSlug?: string) {
    const schoolId = await this.resolveSchoolId(schoolSlug);
    const defaultPassword = await this.getDefaultPassword(schoolId);
    const user = await this.prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        ...(schoolId ? { schoolId } : {}),
        OR: [{ uniqueId: adminId }, { email: adminId }],
      },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await this.verifyPassword(password, user.password, defaultPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return this.buildTokenResponse(user, 'admin', user.uniqueId);
  }

  async forgotPassword(email: string) {
    if (!email) throw new BadRequestException('Email is required');
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (user) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await this.prisma.passwordResetToken.create({ data: { email, code, expiresAt } });
      await this.emailService.sendPasswordReset(email, code, `${user.firstName} ${user.lastName}`);
    }
    return { success: true, message: 'If that email exists, a reset code has been sent.' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    if (!email || !code || !newPassword) throw new BadRequestException('All fields are required');
    const token = await this.prisma.passwordResetToken.findFirst({
      where: { email, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) throw new BadRequestException('Invalid or expired reset code');
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.updateMany({ where: { email }, data: { password: hashed } });
    await this.prisma.passwordResetToken.update({ where: { id: token.id }, data: { used: true } });
    return { success: true, message: 'Password reset successfully. You can now log in.' };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token required');
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_SECRET + '_refresh' });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const token = this.jwt.sign({ id: payload.id, role: payload.role });
    const newRefresh = this.jwt.sign(
      { id: payload.id, role: payload.role },
      { secret: process.env.JWT_SECRET + '_refresh', expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' },
    );
    return { success: true, data: { token, refresh_token: newRefresh }, message: 'Token refreshed' };
  }

  private async verifyPassword(input: string, hash: string, fallback: string): Promise<boolean> {
    if (!hash) return input === fallback;
    try { if (await bcrypt.compare(input, hash)) return true; } catch {}
    return input === fallback || input === hash;
  }

  private buildTokenResponse(user: any, role: string, id: string, isDriver = false) {
    this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    const token = this.jwt.sign({ id, role, email: user.email, schoolId: user.schoolId?.toString() });
    const refresh_token = this.jwt.sign(
      { id, role },
      { secret: process.env.JWT_SECRET + '_refresh', expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' },
    );
    const { password: _, ...safeUser } = user;
    return {
      success: true,
      data: { user: this.normalizeValue({ ...safeUser, role, ...(isDriver ? { isDriver: true } : {}) }), token, refresh_token },
      message: 'Login successful',
    };
  }

  async savePushToken(userId: number | bigint, token: string) {
    if (!token || !token.startsWith('ExponentPushToken[')) {
      return { success: false, message: 'Invalid push token' };
    }
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { pushToken: token },
    });
    return { success: true, message: 'Push token saved' };
  }

  private async resolveSchoolId(slug?: string) {
    if (!slug) return undefined;
    const school = await this.prisma.school.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!school) throw new UnauthorizedException('Invalid school');
    if (school.status !== 'ACTIVE') throw new ForbiddenException('School is yet to be approved');
    return school.id;
  }

  private async getDefaultPassword(schoolId: bigint | undefined): Promise<string> {
    if (!schoolId) return 'florieren';
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, slug: true },
    });
    if (!school) return 'florieren';
    const key = `${school.name} ${school.slug}`.toLowerCase();
    if (key.includes('greatkings')) return 'greatkings';
    if (key.includes('florieren')) return 'florieren';
    return 'florieren';
  }

  private normalizeValue(value: any): any {
    if (typeof value === 'bigint') {
      return value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER
        ? Number(value) : value.toString();
    }
    if (Array.isArray(value)) return value.map(item => this.normalizeValue(item));
    if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, this.normalizeValue(nested)]));
    }
    return value;
  }
}
