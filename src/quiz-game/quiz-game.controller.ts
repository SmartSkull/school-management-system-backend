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
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadAndGenerate(@UploadedFile() file: Express.Multer.File): Promise<{ success: boolean; questions: Question[]; textLength: number }> {
    if (!file) throw new BadRequestException('No file uploaded');

    const ext = extname(file.originalname).toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      fs.existsSync(file.path) && fs.unlinkSync(file.path);
      throw new BadRequestException('Unsupported format. Use PDF, DOCX, or TXT.');
    }

    let text = '';
    try {
      text = (await this.gateway.extractText(file.path, file.originalname)).replace(/\s+/g, ' ').trim();
    } catch (e: any) {
      fs.existsSync(file.path) && fs.unlinkSync(file.path);
      throw new BadRequestException(`Text extraction failed: ${e.message}`);
    } finally {
      fs.existsSync(file.path) && fs.unlinkSync(file.path);
    }

    if (text.length < 50) throw new BadRequestException(`Extracted only ${text.length} characters — document may be image-based or empty`);

    const questions = await this.gateway.generateQuestions(text, 10);
    if (!questions.length) throw new BadRequestException('AI could not generate questions from this document');

    return { success: true, questions, textLength: text.length };
  }
}
