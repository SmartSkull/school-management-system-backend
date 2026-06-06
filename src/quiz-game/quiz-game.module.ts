import { Module } from '@nestjs/common';
import { QuizGameGateway } from './quiz-game.gateway';
import { QuizGameController } from './quiz-game.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StudentGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [QuizGameController],
  providers: [QuizGameGateway, JwtAuthGuard, StudentGuard],
})
export class QuizGameModule {}
