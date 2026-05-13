import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { StaffService } from './staff.service';
import { StaffGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

const imageStorage = diskStorage({
  destination: './uploads',
  filename: (_, file, cb) => cb(null, `${Date.now()}${extname(file.originalname)}`),
});

@Controller('staff')
@UseGuards(StaffGuard)
export class StaffController {
  constructor(private svc: StaffService) {}

  @Get('dashboard') dashboard(@CurrentUser() user: any) { return this.svc.dashboard(user); }

  @Get('profile') profile(@CurrentUser() user: any) { return this.svc.profile(user); }

  @Put('profile') updateProfile(@CurrentUser() user: any, @Body() body: any) { return this.svc.updateProfile(user, body); }

  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image', { storage: imageStorage }))
  updateImage(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.updateImage(user, file);
  }

  @Get('students') getStudents(@CurrentUser() user: any, @Query('class') cls: string, @Query('search') search: string) { return this.svc.getStudents(user, cls, search); }
  @Get('students/:id') getStudentDetails(@Param('id') id: string) { return this.svc.getStudentDetails(id); }

  @Post('results') uploadResult(@CurrentUser() user: any, @Body() body: any) { return this.svc.uploadResult(user, body); }
  @Get('results') getResults(@CurrentUser() user: any, @Query() q: any) { return this.svc.getResults(user, q); }
  @Delete('results') deleteResult(@Body() body: any) { return this.svc.deleteResult(body); }
  @Post('results/delete') deleteResultByBody(@Body() body: any) { return this.svc.deleteResult(body); }

  @Get('attendance') getAttendance(@Query() q: any) { return this.svc.getAttendance(q); }
  @Post('attendance') updateAttendance(@Body() body: any) { return this.svc.updateAttendance(body); }
  @Post('comment') addComment(@Body() body: any) { return this.svc.addComment(body); }

  @Post('assignments')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: './uploads/assignments', filename: (_, f, cb) => cb(null, `${Date.now()}_${f.originalname}`) }) }))
  createAssignment(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.createAssignment(user, body, file);
  }

  @Get('assignments') getAssignments(@CurrentUser() user: any) { return this.svc.getAssignments(user); }

  @Put('assignments/:id')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: './uploads/assignments', filename: (_, f, cb) => cb(null, `${Date.now()}_${f.originalname}`) }) }))
  updateAssignment(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.updateAssignment(user, +id, body, file);
  }

  @Delete('assignments/:id') deleteAssignment(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteAssignment(user, +id); }

  @Get('library') getLibrary(@CurrentUser() user: any) { return this.svc.getLibrary(user); }

  @Post('library')
  @UseInterceptors(FileInterceptor('pdf', { storage: diskStorage({ destination: './uploads', filename: (_, f, cb) => cb(null, `${Date.now()}_${f.originalname}`) }) }))
  uploadLibrary(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadLibrary(user, body, file);
  }

  @Delete('library/:id') deleteLibrary(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteLibrary(user, +id); }

  @Get('classes') getClasses() { return this.svc.getClasses(); }
  @Get('courses') getCourses() { return this.svc.getCourses(); }
  @Get('school-days') getSchoolDays() { return this.svc.getSchoolDays(); }

  @Get('notifications') getNotifications(@CurrentUser() user: any) { return this.svc.getNotifications(user); }
  @Post('notifications/read') markNotificationsRead(@CurrentUser() user: any) { return this.svc.markNotificationsRead(user); }
}
