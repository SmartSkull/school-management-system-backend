import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CbtService } from './cbt.service';
import { JwtAuthGuard, StaffGuard, StudentGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller()
export class CbtController {
  constructor(private svc: CbtService) {}

  @Get('student/cbt/tests')
  @UseGuards(StudentGuard)
  getAvailableTests(@CurrentUser() user: any) { return this.svc.getAvailableTests(user); }

  @Get('student/cbt/start/:course')
  @UseGuards(StudentGuard)
  startTest(@CurrentUser() user: any, @Param('course') course: string) { return this.svc.startTest(user, course); }

  @Post('student/cbt/answer')
  @UseGuards(StudentGuard)
  submitAnswer(@CurrentUser() user: any, @Body() body: any) { return this.svc.submitAnswer(user, body); }

  @Post('student/cbt/submit')
  @UseGuards(StudentGuard)
  submitTest(@CurrentUser() user: any, @Body('course') course: string) { return this.svc.submitTest(user, course); }

  @Get('student/cbt/results')
  @UseGuards(StudentGuard)
  getStudentResults(@CurrentUser() user: any) { return this.svc.getStudentResults(user); }

  @Get('staff/cbt')
  @UseGuards(StaffGuard)
  getStaffExams(@CurrentUser() user: any) { return this.svc.getStaffExams(user); }

  @Post('staff/cbt/questions')
  @UseGuards(StaffGuard)
  createQuestion(@CurrentUser() user: any, @Body() body: any) { return this.svc.createQuestion(user, body); }

  @Get('staff/cbt/questions')
  @UseGuards(StaffGuard)
  getQuestions(@Query('class') cls: string, @Query('course') course: string) { return this.svc.getQuestions(cls, course); }

  @Delete('staff/cbt/questions/:id')
  @UseGuards(StaffGuard)
  deleteQuestion(@Param('id') id: string) { return this.svc.deleteQuestion(+id); }

  @Get('staff/cbt/results')
  @UseGuards(StaffGuard)
  getExamResults(@Query('class') cls: string, @Query('course') course: string) { return this.svc.getExamResults(cls, course); }

  @Post('staff/cbt/extract-questions')
  @UseGuards(StaffGuard)
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: './uploads', filename: (_, f, cb) => cb(null, `${Date.now()}${extname(f.originalname)}`) }) }))
  extractQuestions(@UploadedFile() file: Express.Multer.File) { return this.svc.extractQuestions(file); }

  @Post('staff/cbt/bulk-create')
  @UseGuards(StaffGuard)
  bulkCreate(@CurrentUser() user: any, @Body() body: any) { return this.svc.bulkCreate(user, body); }

  @Post('admin/cbt/questions')
  @UseGuards(StaffGuard)
  adminCreateQuestion(@CurrentUser() user: any, @Body() body: any) { return this.svc.createQuestion(user, body); }

  @Get('admin/cbt/questions')
  @UseGuards(StaffGuard)
  adminGetQuestions(@Query('class') cls: string, @Query('course') course: string) { return this.svc.getQuestions(cls, course); }

  @Delete('admin/cbt/questions/:id')
  @UseGuards(StaffGuard)
  adminDeleteQuestion(@Param('id') id: string) { return this.svc.deleteQuestion(+id); }
}
