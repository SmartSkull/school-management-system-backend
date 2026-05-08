import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    protected jwtService: JwtService,
    protected prisma: PrismaService,
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
      if (payload.role === 'student') {
        return this.prisma.user.findFirst({ where: { uniqueId: payload.id } });
      }

      if (payload.role === 'staff') {
        return this.prisma.staff.findFirst({
          where: {
            user: { uniqueId: payload.id, role: 'STAFF' },
          },
          include: { user: true }
        });
      }

      if (payload.role === 'admin') {
        return this.prisma.user.findFirst({
          where: { uniqueId: payload.id, role: 'ADMIN' },
        });
      }
      return null;
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
