import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BookgameService } from './bookgame.service';
import { StudentGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('student/bookgame')
@UseGuards(StudentGuard)
export class BookgameController {
  constructor(private svc: BookgameService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('document', {
    storage: diskStorage({
      destination: './uploads/bookgame',
      filename: (_, f, cb) => cb(null, `${Date.now()}${extname(f.originalname)}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  uploadDocument(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadDocument(user, file);
  }

  @Post('generate')
  generateQuestions(@Body() body: any) { return this.svc.generateQuestions(body); }

  @Post('check')
  checkAnswer(@Body() body: any) { return this.svc.checkAnswer(body); }
}
