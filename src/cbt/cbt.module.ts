import { Module } from '@nestjs/common';
import { CbtController } from './cbt.controller';
import { CbtService } from './cbt.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StudentGuard, StaffGuard, AdminGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [CbtController],
  providers: [CbtService, JwtAuthGuard, StudentGuard, StaffGuard, AdminGuard],
})
export class CbtModule {}
