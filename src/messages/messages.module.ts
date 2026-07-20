import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { NotificationService } from '../common/notification.service';

@Module({
  imports: [AuthModule],
  controllers: [MessagesController],
  providers: [MessagesService, JwtAuthGuard, NotificationService],
})
export class MessagesModule {}
