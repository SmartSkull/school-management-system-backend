import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { EmailService } from '../common/email.service';

@Module({ controllers: [PublicController], providers: [EmailService] })
export class PublicModule {}
