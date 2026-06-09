import { Module } from '@nestjs/common';
import { HostelService } from './hostel.service';
import { HostelController } from './hostel.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [DatabaseModule, JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [HostelController],
  providers: [HostelService],
})
export class HostelModule {}
