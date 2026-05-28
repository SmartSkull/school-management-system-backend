import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StaffGuard } from '../common/guards/auth.guard';
import { EmailService } from '../common/email.service';

@Module({
  imports: [AuthModule, MulterModule.register({ dest: './uploads' })],
  controllers: [StaffController],
  providers: [StaffService, JwtAuthGuard, StaffGuard, EmailService],
})
export class StaffModule {}
