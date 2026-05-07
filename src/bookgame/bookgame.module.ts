import { Module } from '@nestjs/common';
import { BookgameController } from './bookgame.controller';
import { BookgameService } from './bookgame.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StudentGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [BookgameController],
  providers: [BookgameService, JwtAuthGuard, StudentGuard],
})
export class BookgameModule {}
