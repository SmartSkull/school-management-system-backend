import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService, private jwt: JwtService) {}

  async studentLogin(name: string, password: string) {
    const user = await this.db.queryOne<any>(
      'SELECT * FROM users WHERE (student_id = ? OR firstname = ? OR email = ?) AND admin_verify = 1',
      [name, name, name],
    );
    if (!user || !(await bcrypt.compare(password, user.password)))
      throw new UnauthorizedException('Invalid credentials');

    return this.buildTokenResponse(user, 'student', user.student_id);
  }

  async staffLogin(staffId: string, password: string) {
    const staff = await this.db.queryOne<any>(
      'SELECT * FROM staff WHERE unique_id = ? OR email = ?',
      [staffId, staffId],
    );
    if (!staff || !(await bcrypt.compare(password, staff.password)))
      throw new UnauthorizedException('Invalid credentials');

    return this.buildTokenResponse(staff, 'staff', staff.unique_id);
  }

  async adminLogin(adminId: string, password: string) {
    const admin = await this.db.queryOne<any>(
      'SELECT * FROM admin WHERE unique_id = ? OR email = ?',
      [adminId, adminId],
    );
    if (!admin || !(await bcrypt.compare(password, admin.password)))
      throw new UnauthorizedException('Invalid credentials');

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

  private buildTokenResponse(user: any, role: string, id: string) {
    const token = this.jwt.sign({ id, role, email: user.email });
    const refresh_token = this.jwt.sign(
      { id, role },
      { secret: process.env.JWT_SECRET + '_refresh', expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' },
    );
    const { password: _, ...safeUser } = user;
    return { success: true, data: { user: safeUser, token, refresh_token }, message: 'Login successful' };
  }
}
