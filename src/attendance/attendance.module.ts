import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StaffGuard, AdminGuard, StudentGuard } from '../common/guards/auth.guard';
import { EmailService } from '../common/email.service';
import { SmsService } from '../common/sms.service';
import { PushService } from '../common/push.service';
import { NotificationService } from '../common/notification.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, JwtAuthGuard, StaffGuard, AdminGuard, StudentGuard, EmailService, SmsService, PushService, NotificationService],
})
export class AttendanceModule {}
