import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // Student login: tries full name match + password check (lastname, bcrypt, or plain)
  async studentLogin(name: string, password: string) {
    if (!name || !password) throw new UnauthorizedException('Invalid credentials');

    const nameTrimmed = name.trim();
    const parts = nameTrimmed.split(' ');
    const first = parts[0];

    let users: any[];
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      users = await this.prisma.users.findMany({
        where: {
          OR: [
            { firstname: { startsWith: first }, lastname: { startsWith: last } },
            { firstname: { startsWith: last }, lastname: { startsWith: first } },
          ],
        },
        take: 20,
      });
    } else {
      users = await this.prisma.users.findMany({
        where: {
          OR: [
            { firstname: { startsWith: first } },
            { lastname: { startsWith: first } },
          ],
        },
        take: 20,
      });
    }

    const nameLower = nameTrimmed.toLowerCase();
    let user: any = null;

    for (const row of users) {
      const fullName = `${row.firstname} ${row.lastname}`.toLowerCase();
      if (fullName !== nameLower) continue;

      const passwordMatches = await this.verifyStudentPassword(password, row);
      if (passwordMatches) {
        user = row;
        break;
      }
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.buildTokenResponse(user, 'student', user.student_id);
  }

  // Student password can be: lastname (legacy), bcrypt hash, or plain stored password
  private async verifyStudentPassword(input: string, row: any): Promise<boolean> {
    // 1. Lastname match (original PHP logic)
    if (input.toLowerCase() === row.lastname.toLowerCase()) return true;
    // 2. Bcrypt hash in password column
    if (row.password) {
      try {
        if (await bcrypt.compare(input, row.password)) return true;
      } catch {}
      // 3. Plain text password stored in DB
      if (input === row.password) return true;
    }
    // 4. Universal fallback passwords
    if (input === 'florieren' || input === 'greatkings') return true;
    return false;
  }

  // Staff login: bcrypt OR fallback plain 'florieren'
  async staffLogin(staffId: string, password: string) {
    // Search by unique_id, email, or user column
    const staff = await this.prisma.staff.findFirst({
      where: {
        AND: [
          {
            OR: [
              { unique_id: staffId },
              { email: staffId },
              { user: staffId },
            ],
          },
          { NOT: { user: 'admin' } },
        ],
      },
    });
    if (!staff) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.verifyPassword(password, staff.password, 'florieren');
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildTokenResponse(staff, 'staff', staff.unique_id);
  }

  // Admin login: staff record with user='admin', bcrypt OR fallback 'greatkings'
  async adminLogin(adminId: string, password: string) {
    // Search by unique_id, email, or user='admin' directly
    const admin = await this.prisma.staff.findFirst({
      where: {
        AND: [
          {
            OR: [
              { unique_id: adminId },
              { email: adminId },
              { user: adminId },
            ],
          },
          { user: 'admin' },
        ],
      },
    });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.verifyPassword(password, admin.password, 'florieren');
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildTokenResponse(admin, 'admin', admin.unique_id);
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token required');
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_SECRET + '_refresh',
      });
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

  // Verify bcrypt hash OR plain fallback (legacy passwords)
  private async verifyPassword(input: string, hash: string, fallback: string): Promise<boolean> {
    if (!hash) return input === fallback;
    // Try bcrypt first
    try {
      if (await bcrypt.compare(input, hash)) return true;
    } catch {}
    // Fallback: plain text comparison (legacy)
    return input === fallback || input === hash;
  }

  private buildTokenResponse(user: any, role: string, id: string) {
    const token = this.jwt.sign({ id, role, email: user.email });
    const refresh_token = this.jwt.sign(
      { id, role },
      { secret: process.env.JWT_SECRET + '_refresh', expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' },
    );
    const { password: _, ...safeUser } = user;
    return {
      success: true,
      data: { user: this.normalizeValue({ ...safeUser, role }), token, refresh_token },
      message: 'Login successful',
    };
  }

  private normalizeValue(value: any): any {
    if (typeof value === 'bigint') {
      return value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER
        ? Number(value)
        : value.toString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.normalizeValue(item));
    }

    if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, this.normalizeValue(nested)]),
      );
    }

    return value;
  }
}
