import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, AdminGuard } from '../common/guards/auth.guard';
import { EmailService } from '../common/email.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, JwtAuthGuard, AdminGuard, EmailService],
})
export class AdminModule {}
