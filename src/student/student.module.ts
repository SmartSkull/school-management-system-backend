import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard, StudentGuard } from '../common/guards/auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [StudentController],
  providers: [StudentService, JwtAuthGuard, StudentGuard],
})
export class StudentModule {}
