import { Module } from '@nestjs/common';
import { BooksService } from './books.service';
import { BooksController, StaffBooksController, StudentBooksController } from './books.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [DatabaseModule, JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [BooksController, StaffBooksController, StudentBooksController],
  providers: [BooksService],
})
export class BooksModule {}
