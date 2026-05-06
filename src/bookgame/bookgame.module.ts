import { Module } from '@nestjs/common';
import { BookgameController } from './bookgame.controller';
import { BookgameService } from './bookgame.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BookgameController],
  providers: [BookgameService],
})
export class BookgameModule {}
