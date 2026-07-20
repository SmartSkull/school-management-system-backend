import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { PushService } from '../common/push.service';
import { NotificationService } from '../common/notification.service';

@Module({
  imports: [AuthModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, JwtAuthGuard, PushService, NotificationService],
})
export class MessagesModule {}
