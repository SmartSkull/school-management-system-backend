import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [MessagesController],
  providers: [MessagesService, JwtAuthGuard],
})
export class MessagesModule {}
