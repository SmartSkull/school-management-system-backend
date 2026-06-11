import { Controller, Get, Post, Put, Body, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StudentService } from './student.service';
import { StudentGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

@Controller('student')
@UseGuards(StudentGuard)
export class StudentController {
  constructor(private svc: StudentService) {}

  @Get('dashboard') dashboard(@CurrentUser() user: any) { return this.svc.dashboard(user); }
  @Get('profile') profile(@CurrentUser() user: any) { return this.svc.profile(user); }

  @Put('profile') updateProfile(@CurrentUser() user: any, @Body() body: any) { return this.svc.updateProfile(user, body); }

  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  updateImage(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.updateImage(user, file);
  }

  @Get('results') getResults(@CurrentUser() user: any, @Query() q: any) { return this.svc.getResults(user, q); }
  @Get('assignments') getAssignments(@CurrentUser() user: any) { return this.svc.getAssignments(user); }
  @Get('library') getLibrary(@CurrentUser() user: any) { return this.svc.getLibrary(user); }
  @Get('timetable/class') getClassTimetable(@CurrentUser() user: any) { return this.svc.getClassTimetable(user); }
  @Get('timetable/exam') getExamTimetable(@CurrentUser() user: any) { return this.svc.getExamTimetable(user); }

  @Get('notifications') getNotifications(@CurrentUser() user: any) { return this.svc.getNotifications(user); }
  @Post('notifications/read') markNotificationsRead(@CurrentUser() user: any) { return this.svc.markNotificationsRead(user); }

  @Get('payments') getPayments(@CurrentUser() user: any) { return this.svc.getPayments(user); }
  @Post('payments/initialize') initializePayment(@CurrentUser() user: any, @Body() body: any) { return this.svc.initializePayment(user, body); }
  @Get('scratch-cards') getScratchCards(@CurrentUser() user: any) { return this.svc.getScratchCards(user); }
  @Post('scratch-cards') submitPayment(@CurrentUser() user: any, @Body() body: any) { return this.svc.submitPayment(user, body); }

  @Post('pronunciation-game/transcribe')
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async transcribeAudio(@UploadedFile() file: Express.Multer.File) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audioFile = await toFile(file.buffer, 'audio.webm', { type: file.mimetype });
    const result = await openai.audio.transcriptions.create({ model: 'whisper-1', file: audioFile, language: 'en' });
    return { success: true, transcript: result.text };
  }

  @Post('ai-analysis')
  async aiAnalysis(@Body() body: { results: { subject: string; score: number; grade: string }[]; session?: string; term?: string }) {
    if (!body.results?.length) return { success: false, message: 'No results provided' };
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const summary = body.results.map(r => `${r.subject}: ${r.score}/100 (${r.grade})`).join(', ');
    const prompt = `You are a school academic advisor. A student scored the following in ${body.term ?? ''} ${body.session ?? ''}: ${summary}. Write a concise 3-sentence personalised performance analysis: highlight their strongest subject, weakest subject, and give one specific actionable improvement tip. Be encouraging and direct.`;
    const chat = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    });
    return { success: true, data: { analysis: chat.choices[0]?.message?.content ?? '' } };
  }
}
