import { Module } from '@nestjs/common';
import { StudentSchoolFeesController, PaystackCallbackController, AdminSchoolFeesController } from './school-fees.controller';
import { SchoolFeesService } from './school-fees.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StudentGuard, AdminGuard } from '../common/guards/auth.guard';
import { PushService } from '../common/push.service';
import { NotificationService } from '../common/notification.service';

@Module({
  imports: [AuthModule],
  controllers: [PaystackCallbackController, StudentSchoolFeesController, AdminSchoolFeesController],
  providers: [SchoolFeesService, JwtAuthGuard, StudentGuard, AdminGuard, PushService, NotificationService],
})
export class SchoolFeesModule {}
