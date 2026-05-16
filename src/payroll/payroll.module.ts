import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard, AdminGuard, StaffGuard } from '../common/guards/auth.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PayrollController],
  providers: [PayrollService, JwtAuthGuard, AdminGuard, StaffGuard],
})
export class PayrollModule {}
