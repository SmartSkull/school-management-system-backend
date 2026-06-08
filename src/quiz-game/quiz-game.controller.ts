import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, InternalServerErrorException } from '@nestjs/common';
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

  @Post('generate')
  async generateBySubject(@Body() body: { subject: string; count?: number }): Promise<{ success: boolean; questions: Question[] }> {
    if (!body.subject?.trim()) throw new BadRequestException('Subject is required');
    try {
      const questions = await this.gateway.generateQuestionsForSubject(body.subject.trim(), body.count ?? 10);
      if (!questions.length) throw new BadRequestException('AI could not generate questions');
      return { success: true, questions };
    } catch (e: any) {
      throw new InternalServerErrorException(e?.message ?? 'Failed to generate questions');
    }
  }

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
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new BadRequestException('Unsupported format. Use PDF, DOCX, or TXT.');
    }

    let text = '';
    try {
      text = (await this.gateway.extractText(file.path, file.originalname)).replace(/\s+/g, ' ').trim();
    } catch (e: any) {
      console.error('[QuizGame] extractText error:', e);
      throw new BadRequestException(`Text extraction failed: ${e?.message ?? e}`);
    } finally {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    if (text.length < 50) {
      throw new BadRequestException(`Extracted only ${text.length} characters — document may be image-based or empty`);
    }

    let questions: Question[] = [];
    try {
      questions = await this.gateway.generateQuestions(text, 10);
    } catch (e: any) {
      console.error('[QuizGame] generateQuestions error:', e);
      throw new InternalServerErrorException(`AI question generation failed: ${e?.message ?? e}`);
    }

    if (!questions.length) throw new BadRequestException('AI could not generate questions from this document');

    return { success: true, questions, textLength: text.length };
  }
}
