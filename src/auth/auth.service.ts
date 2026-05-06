import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService, private jwt: JwtService) {}

  // Student login: tries full name match + password check (lastname, bcrypt, or plain)
  async studentLogin(name: string, password: string) {
    if (!name || !password) throw new UnauthorizedException('Invalid credentials');

    const nameTrimmed = name.trim();
    const parts = nameTrimmed.split(' ');
    const first = parts[0];
    const like = `${first}%`;

    let users: any[];
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      users = await this.db.query(
        'SELECT * FROM users WHERE (firstname LIKE ? AND lastname LIKE ?) OR (firstname LIKE ? AND lastname LIKE ?) LIMIT 20',
        [like, `${last}%`, `${last}%`, like],
      );
    } else {
      users = await this.db.query(
        'SELECT * FROM users WHERE firstname LIKE ? OR lastname LIKE ? LIMIT 20',
        [like, like],
      );
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
    const staff = await this.db.queryOne<any>(
      "SELECT * FROM staff WHERE (unique_id = ? OR email = ? OR user = ?) AND user != 'admin' LIMIT 1",
      [staffId, staffId, staffId],
    );
    if (!staff) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.verifyPassword(password, staff.password, 'florieren');
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildTokenResponse(staff, 'staff', staff.unique_id);
  }

  // Admin login: staff record with user='admin', bcrypt OR fallback 'greatkings'
  async adminLogin(adminId: string, password: string) {
    // Search by unique_id, email, or user='admin' directly
    const admin = await this.db.queryOne<any>(
      "SELECT * FROM staff WHERE (unique_id = ? OR email = ? OR user = ?) AND user = 'admin' LIMIT 1",
      [adminId, adminId, adminId],
    );
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
    return { success: true, data: { user: { ...safeUser, role }, token, refresh_token }, message: 'Login successful' };
  }
}
