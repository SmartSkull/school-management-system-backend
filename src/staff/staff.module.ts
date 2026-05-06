import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, MulterModule.register({ dest: './uploads' })],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
