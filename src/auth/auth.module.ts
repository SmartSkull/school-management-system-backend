import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, StudentGuard, StaffGuard, AdminGuard } from '../common/guards/auth.guard';
import { EmailService } from '../common/email.service';
import { WebPushService } from '../common/web-push.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'gka_jwt_secret_key_2024_secure_token',
      signOptions: { expiresIn: process.env.JWT_EXPIRY || '8h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, JwtAuthGuard, StudentGuard, StaffGuard, AdminGuard, WebPushService],
  exports: [JwtModule, JwtAuthGuard, StudentGuard, StaffGuard, AdminGuard],
})
export class AuthModule {}
