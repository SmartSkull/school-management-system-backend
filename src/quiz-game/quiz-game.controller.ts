import { Controller, Post, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { QuizGameGateway } from './quiz-game.gateway';
import { Question } from './quiz-game.types';
import { StudentGuard } from '../common/guards/auth.guard';

@Controller('student/quiz-game')
@UseGuards(StudentGuard)
export class QuizGameController {
  constructor(private gateway: QuizGameGateway) {}

  @Post('upload-and-generate')
  @UseInterceptors(FileInterceptor('document', {
    storage: diskStorage({
      destination: './uploads/quiz-game',
      filename: (_, f, cb) => cb(null, `${Date.now()}${extname(f.originalname)}`),
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_, f, cb) => {
      const allowed = ['.pdf', '.docx', '.txt'];
      cb(null, allowed.includes(extname(f.originalname).toLowerCase()));
    },
  }))
  async uploadAndGenerate(@UploadedFile() file: Express.Multer.File): Promise<{ success: boolean; questions: Question[]; textLength: number }> {
    if (!file) throw new BadRequestException('No file uploaded or unsupported format (PDF, DOCX, TXT only)');

    const text = this.gateway.extractText(file.path, file.originalname).replace(/\s+/g, ' ').trim();
    fs.unlinkSync(file.path);

    if (!text || text.length < 100) throw new BadRequestException('Could not extract enough text from the document');

    const questions = await this.gateway.generateQuestions(text, 10);
    if (!questions.length) throw new BadRequestException('AI could not generate questions from this document');

    return { success: true, questions, textLength: text.length };
  }
}
