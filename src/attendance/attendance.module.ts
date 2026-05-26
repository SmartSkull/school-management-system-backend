import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StaffGuard, AdminGuard, StudentGuard } from '../common/guards/auth.guard';
import { EmailService } from '../common/email.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, JwtAuthGuard, StaffGuard, AdminGuard, StudentGuard, EmailService],
})
export class AttendanceModule {}
