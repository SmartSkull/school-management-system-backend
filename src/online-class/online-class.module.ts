import { Module } from '@nestjs/common';
import { OnlineClassController } from './online-class.controller';
import { OnlineClassService } from './online-class.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StaffGuard, StudentGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [OnlineClassController],
  providers: [OnlineClassService, JwtAuthGuard, StaffGuard, StudentGuard],
})
export class OnlineClassModule {}
