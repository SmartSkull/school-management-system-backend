import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [PostsController],
  providers: [PostsService, JwtAuthGuard],
})
export class PostsModule {}
