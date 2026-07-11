import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AdminGuard, StaffGuard, StudentGuard } from '../common/guards/auth.guard';
import { CbtService } from './cbt.service';

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

  @Put('staff/cbt/tests/:id/schedule')
  @UseGuards(StaffGuard)
  updateTestSchedule(
    @Param('id') id: string,
    @Body('startTime') startTime: string | null,
    @Body('endTime') endTime: string | null,
  ) { return this.svc.updateTestSchedule(id, startTime, endTime); }

  @Put('staff/cbt/tests/:id')
  @UseGuards(StaffGuard)
  updateTest(@Param('id') id: string, @Body() body: any) { return this.svc.updateTest(id, body); }

  @Post('staff/cbt/questions')
  @UseGuards(StaffGuard)
  createQuestion(@CurrentUser() user: any, @Body() body: any) { return this.svc.createQuestion(user, body); }

  @Get('staff/cbt/questions')
  @UseGuards(StaffGuard)
  getQuestions(@CurrentUser() user: any, @Query('class') cls: string, @Query('course') course: string, @Query('session') session: string, @Query('term') term: string) {
    return this.svc.getQuestions(user, cls, course, session, term);
  }

  @Delete('staff/cbt/questions/bulk')
  @UseGuards(StaffGuard)
  bulkDeleteQuestions(@Body('ids') ids: string[]) { return this.svc.bulkDeleteQuestions(ids); }

  @Delete('staff/cbt/questions/:id')
  @UseGuards(StaffGuard)
  deleteQuestion(@Param('id') id: string) { return this.svc.deleteQuestion(id); }

  @Put('staff/cbt/questions/:id')
  @UseGuards(StaffGuard)
  updateQuestion(@Param('id') id: string, @Body() body: any) { return this.svc.updateQuestion(id, body); }

  @Get('staff/cbt/results')
  @UseGuards(StaffGuard)
  getExamResults(
    @CurrentUser() user: any,
    @Query('class') cls: string,
    @Query('course') course: string,
    @Query('session') session: string,
    @Query('term') term: string,
    @Query('teacher') teacher: string,
  ) { return this.svc.getExamResults(user, cls, course, session, term, teacher); }

  @Delete('staff/cbt/results/:id')
  @UseGuards(StaffGuard)
  deleteResult(@Param('id') id: string) { return this.svc.deleteResult(id); }

  @Post('staff/cbt/extract-questions')
  @UseGuards(StaffGuard)
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: './uploads', filename: (_, f, cb) => cb(null, `${Date.now()}${extname(f.originalname)}`) }) }))
  extractQuestions(@UploadedFile() file: Express.Multer.File) { return this.svc.extractQuestions(file); }

  @Post('staff/cbt/upload-image')
  @UseGuards(StaffGuard)
  @UseInterceptors(FileInterceptor('image', { storage: diskStorage({ destination: './uploads/cbt-images', filename: (_, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(f.originalname)}`) }) }))
  uploadQuestionImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('No file uploaded');
    return { success: true, data: { url: `/uploads/cbt-images/${file.filename}` } };
  }

  @Post('staff/cbt/bulk-create')
  @UseGuards(StaffGuard)
  bulkCreate(@CurrentUser() user: any, @Body() body: any) { return this.svc.bulkCreate(user, body); }

  @Post('admin/cbt/questions')
  @UseGuards(AdminGuard)
  adminCreateQuestion(@CurrentUser() user: any, @Body() body: any) { return this.svc.createQuestion(user, body); }

  @Get('admin/cbt/questions')
  @UseGuards(AdminGuard)
  adminGetQuestions(@Query('class') cls: string, @Query('course') course: string) { return this.svc.getQuestions(null, cls, course); }

  @Get('admin/cbt/tests')
  @UseGuards(AdminGuard)
  adminGetTests(@Query() q: any) { return this.svc.adminGetTests(q); }

  @Delete('admin/cbt/questions/:id')
  @UseGuards(AdminGuard)
  adminDeleteQuestion(@Param('id') id: string) { return this.svc.deleteQuestion(id); }

  @Delete('admin/cbt/tests/:id')
  @UseGuards(AdminGuard)
  adminDeleteTest(@Param('id') id: string) { return this.svc.adminDeleteTest(id); }

  // ─── Desktop App Endpoints ────────────────────────────────────────────────

  @Get('admin/cbt/tests/:id/export')
  @UseGuards(AdminGuard)
  exportTestForDesktop(@Param('id') id: string) { return this.svc.exportTestForDesktop(id); }

  @Post('admin/cbt/results/import')
  @UseGuards(AdminGuard)
  importResultsFromDesktop(@Body() body: any) { return this.svc.importResultsFromDesktop(body); }
}
