import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    protected jwtService: JwtService,
    protected db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('No token provided');

    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.resolveUser(payload);
    if (!user) throw new UnauthorizedException('User not found');

    req.user = { ...user, role: payload.role };
    return true;
  }

  protected extractToken(req: any): string | null {
    const auth = req.headers['authorization'] || req.headers['x-auth-token'];
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return auth || null;
  }

  protected async resolveUser(payload: any): Promise<any> {
    switch (payload.role) {
      case 'student':
        return this.db.queryOne('SELECT * FROM users WHERE student_id = ?', [payload.id]);
      case 'staff':
        return this.db.queryOne('SELECT * FROM staff WHERE unique_id = ?', [payload.id]);
      case 'admin':
        return this.db.queryOne('SELECT * FROM admin WHERE unique_id = ?', [payload.id]);
      default:
        return null;
    }
  }
}

@Injectable()
export class StudentGuard extends JwtAuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const user = ctx.switchToHttp().getRequest().user;
    if (user.role !== 'student') throw new ForbiddenException('Students only');
    return true;
  }
}

@Injectable()
export class StaffGuard extends JwtAuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const user = ctx.switchToHttp().getRequest().user;
    if (!['staff', 'admin'].includes(user.role)) throw new ForbiddenException('Staff only');
    return true;
  }
}

@Injectable()
export class AdminGuard extends JwtAuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const user = ctx.switchToHttp().getRequest().user;
    if (user.role !== 'admin') throw new ForbiddenException('Admin only');
    return true;
  }
}
