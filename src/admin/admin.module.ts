import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, AdminGuard } from '../common/guards/auth.guard';
import { EmailService } from '../common/email.service';
import { SmsService } from '../common/sms.service';
import { PushService } from '../common/push.service';
import { WebPushService } from '../common/web-push.service';
import { NotificationService } from '../common/notification.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, JwtAuthGuard, AdminGuard, EmailService, SmsService, PushService, WebPushService, NotificationService],
})
export class AdminModule {}
