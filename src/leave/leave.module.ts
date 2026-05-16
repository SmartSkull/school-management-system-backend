import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StaffGuard, AdminGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule, MulterModule.register({ dest: './uploads/leave' })],
  controllers: [LeaveController],
  providers: [LeaveService, JwtAuthGuard, StaffGuard, AdminGuard],
})
export class LeaveModule {}
