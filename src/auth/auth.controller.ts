import { Controller, Post, Get, Body, UseGuards, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('student/login')
  @HttpCode(200)
  studentLogin(@Body() body: { name: string; password: string }) {
    return this.auth.studentLogin(body.name, body.password);
  }

  @Post('staff/login')
  @HttpCode(200)
  staffLogin(@Body() body: { staff_id: string; password: string }) {
    return this.auth.staffLogin(body.staff_id, body.password);
  }

  @Post('admin/login')
  @HttpCode(200)
  adminLogin(@Body() body: { admin_id: string; password: string }) {
    return this.auth.adminLogin(body.admin_id, body.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body('refresh_token') token: string) {
    return this.auth.refreshToken(token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return { success: true, data: user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  logout() {
    return { success: true, message: 'Logged out successfully' };
  }
}
