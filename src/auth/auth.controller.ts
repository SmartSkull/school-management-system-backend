import { Controller, Post, Get, Body, UseGuards, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { WebPushService } from '../common/web-push.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private webPush: WebPushService) {}

  @Post('student/login')
  @HttpCode(200)
  studentLogin(@Body() body: { name: string; password: string; school_slug?: string }) {
    return this.auth.studentLogin(body.name, body.password, body.school_slug);
  }

  @Post('staff/login')
  @HttpCode(200)
  staffLogin(@Body() body: { staff_id: string; password: string; school_slug?: string }) {
    return this.auth.staffLogin(body.staff_id, body.password, body.school_slug);
  }

  @Post('admin/login')
  @HttpCode(200)
  adminLogin(@Body() body: { admin_id: string; password: string; school_slug?: string }) {
    return this.auth.adminLogin(body.admin_id, body.password, body.school_slug);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body('email') email: string) {
    return this.auth.forgotPassword(email);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() body: { email: string; code: string; password: string }) {
    return this.auth.resetPassword(body.email, body.code, body.password);
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

  /** Save / update the Expo push token for the authenticated user */
  @Post('push-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  savePushToken(
    @CurrentUser() user: any,
    @Body('token') token: string,
  ) {
    return this.auth.savePushToken(user.id, token);
  }

  /** Save a browser Web Push subscription for the authenticated user */
  @Post('web-push-subscription')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async saveWebPushSubscription(
    @CurrentUser() user: any,
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    // authUserId is always the User table PK regardless of role (staff resolves via Staff record)
    const userId = BigInt(user.authUserId ?? user.id);
    await this.webPush.saveSubscription(userId, body);
    return { success: true, message: 'Push subscription saved' };
  }

  /** Expose VAPID public key so the frontend can subscribe */
  @Get('web-push-key')
  getVapidPublicKey() {
    return { success: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY ?? '' } };
  }
}
