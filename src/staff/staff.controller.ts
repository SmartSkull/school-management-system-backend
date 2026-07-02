import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StaffService } from './staff.service';
import { StaffGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

const imageStorage = memoryStorage();

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
  @Post('students') registerStudent(@CurrentUser() user: any, @Body() body: any) { return this.svc.createStudent(user, body); }
  @Get('students/:id') getStudentDetails(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.getStudentDetails(user, id); }

  @Post('results') uploadResult(@CurrentUser() user: any, @Body() body: any) { return this.svc.uploadResult(user, body); }
  @Get('results') getResults(@CurrentUser() user: any, @Query() q: any) { return this.svc.getResults(user, q); }
  @Delete('results') deleteResult(@CurrentUser() user: any, @Body() body: any) { return this.svc.deleteResult(user, body); }
  @Post('results/delete') deleteResultByBody(@CurrentUser() user: any, @Body() body: any) { return this.svc.deleteResult(user, body); }

  @Get('attendance') getAttendance(@CurrentUser() user: any, @Query() q: any) { return this.svc.getAttendance(user, q); }
  @Post('attendance') updateAttendance(@CurrentUser() user: any, @Body() body: any) { return this.svc.updateAttendance(user, body); }
  @Post('comment') addComment(@CurrentUser() user: any, @Body() body: any) { return this.svc.addComment(user, body); }

  @Post('assignments')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  createAssignment(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.createAssignment(user, body, file);
  }

  @Get('assignments') getAssignments(@CurrentUser() user: any) { return this.svc.getAssignments(user); }

  @Get('assignments/:id/submissions') getAssignmentSubmissions(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.getAssignmentSubmissions(user, +id); }

  @Put('assignments/:id')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  updateAssignment(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.updateAssignment(user, +id, body, file);
  }

  @Delete('assignments/:id') deleteAssignment(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteAssignment(user, +id); }

  @Get('library') getLibrary(@CurrentUser() user: any) { return this.svc.getLibrary(user); }

  @Post('library')
  @UseInterceptors(FileInterceptor('pdf', { storage: memoryStorage() }))
  uploadLibrary(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadLibrary(user, body, file);
  }

  @Delete('library/:id') deleteLibrary(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteLibrary(user, +id); }

  @Get('classes') getClasses(@CurrentUser() user: any) { return this.svc.getClasses(user); }
  @Get('courses') getCourses(@CurrentUser() user: any) { return this.svc.getCourses(user); }
  @Get('school-days') getSchoolDays() { return this.svc.getSchoolDays(); }

  @Get('notifications') getNotifications(@CurrentUser() user: any) { return this.svc.getNotifications(user); }
  @Post('notifications/read') markNotificationsRead(@CurrentUser() user: any) { return this.svc.markNotificationsRead(user); }

  @Get('timetable/class') getClassTimetables(@CurrentUser() user: any) { return this.svc.getClassTimetables(user); }
  @Post('timetable/class') saveClassTimetable(@CurrentUser() user: any, @Body() body: any) { return this.svc.saveClassTimetable(user, body); }
  @Delete('timetable/class/:id') deleteClassTimetable(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteClassTimetable(user, id); }

  @Get('timetable/exam') getExamTimetables(@CurrentUser() user: any) { return this.svc.getExamTimetables(user); }
  @Post('timetable/exam') saveExamTimetable(@CurrentUser() user: any, @Body() body: any) { return this.svc.saveExamTimetable(user, body); }
  @Delete('timetable/exam/:id') deleteExamTimetable(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteExamTimetable(user, id); }

  @Get('curriculum/topics') getTopics(@CurrentUser() user: any, @Query() q: any) { return this.svc.getTopics(user, q); }
  @Post('curriculum/topics') saveTopic(@CurrentUser() user: any, @Body() body: any) { return this.svc.saveTopic(user, body); }
  @Delete('curriculum/topics/:id') deleteTopic(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteTopic(user, id); }

  @Get('curriculum/lesson-plans') getLessonPlans(@CurrentUser() user: any, @Query() q: any) { return this.svc.getLessonPlans(user, q); }
  @Post('curriculum/lesson-plans') saveLessonPlan(@CurrentUser() user: any, @Body() body: any) { return this.svc.saveLessonPlan(user, body); }
  @Delete('curriculum/lesson-plans/:id') deleteLessonPlan(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteLessonPlan(user, id); }

  @Get('curriculum/weekly-schemes') getWeeklySchemes(@CurrentUser() user: any, @Query() q: any) { return this.svc.getWeeklySchemes(user, q); }
  @Post('curriculum/weekly-schemes') saveWeeklyScheme(@CurrentUser() user: any, @Body() body: any) { return this.svc.saveWeeklyScheme(user, body); }
  @Delete('curriculum/weekly-schemes/:id') deleteWeeklyScheme(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteWeeklyScheme(user, id); }

  @Get('traits') getTraits(@CurrentUser() user: any, @Query() q: any) { return this.svc.getTraits(user, q); }
  @Post('traits') saveTraits(@CurrentUser() user: any, @Body() body: any) { return this.svc.saveTraits(user, body); }
}
