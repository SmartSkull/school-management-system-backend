import { Module, forwardRef } from '@nestjs/common';
import { TransportService } from './transport.service';
import { TransportController, DriverController, StudentTransportController, StaffTransportController } from './transport.controller';
import { TransportGateway } from './transport.gateway';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { EmailService } from '../common/email.service';
import { SmsService } from '../common/sms.service';

@Module({
  imports: [DatabaseModule, JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [TransportController, DriverController, StudentTransportController, StaffTransportController],
  providers: [TransportService, TransportGateway, EmailService, SmsService],
  exports: [TransportService],
})
export class TransportModule {}
