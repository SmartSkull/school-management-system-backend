import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AdminGuard } from '../common/guards/auth.guard';
import { AdminService } from './admin.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private svc: AdminService) {}

  @Get('dashboard') dashboard(@CurrentUser() user: any) { return this.svc.dashboard(user); }

  @Get('school')
  getSchool(@CurrentUser() user: any) { return this.svc.getSchool(user); }

  @Put('school')
  updateSchool(@CurrentUser() user: any, @Body() body: any) { return this.svc.updateSchool(user, body); }

  @Post('school/upload-logo')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadLogo(@CurrentUser() user: any, @UploadedFile() logo: Express.Multer.File) { return this.svc.uploadLogo(user, logo); }

  // Settings (principal, signature, class-teacher assignments)
  @Get('settings') getSettings(@CurrentUser() user: any) { return this.svc.getSettings(user); }
  @Put('settings') updateSettings(@CurrentUser() user: any, @Body() body: any) { return this.svc.updateSettings(user, body); }
  @Post('settings/upload-signature')
  @UseInterceptors(FileInterceptor('signature', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadSignature(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) { return this.svc.uploadSignature(user, file); }

  // Students
  @Get('students')
  getStudents(@CurrentUser() user: any, @Query() q: any) { return this.svc.getStudents(user, q); }

  @Post('students')
  createStudent(@CurrentUser() user: any, @Body() body: any) { return this.svc.createStudent(user, body); }

  @Post('students/bulk-verify')
  bulkVerify(@Body('student_ids') ids: string[]) { return this.svc.bulkVerifyStudents(ids); }

  @Post('students/verify')
  verifyStudentByBody(@Body('student_id') id: string) { return this.svc.verifyStudent(id); }

  @Post('students/unverify')
  unverifyStudentByBody(@Body('student_id') id: string) { return this.svc.unverifyStudent(id); }

  @Post('students/delete')
  deleteStudentByBody(@Body('student_id') id: string) { return this.svc.deleteStudent(id); }

  @Post('students/update')
  updateStudentByBody(@Body() body: any) { return this.svc.updateStudent(body.student_id, body); }

  @Post('students/change-password')
  changeStudentPassword(@Body() body: any) { return this.svc.changeStudentPassword(body); }

  @Put('students/:id/verify')
  verifyStudent(@Param('id') id: string) { return this.svc.verifyStudent(id); }

  @Put('students/:id/unverify')
  unverifyStudent(@Param('id') id: string) { return this.svc.unverifyStudent(id); }

  @Put('students/:id')
  updateStudent(@Param('id') id: string, @Body() body: any) { return this.svc.updateStudent(id, body); }

  @Delete('students/:id')
  deleteStudent(@Param('id') id: string) { return this.svc.deleteStudent(id); }

  // Staff
  @Get('staff') getStaff(@CurrentUser() user: any, @Query() q: any) { return this.svc.getStaff(user, q); }

  @Post('staff') createStaff(@CurrentUser() user: any, @Body() body: any) { return this.svc.createStaff(user, body); }

  @Post('staff/verify')
  verifyStaffByBody(@Body('staff_id') id: string) { return this.svc.verifyStaff(id); }

  @Post('staff/unverify')
  unverifyStaffByBody(@Body('staff_id') id: string) { return this.svc.unverifyStaff(id); }

  @Post('staff/delete')
  deleteStaffByBody(@Body('staff_id') id: string) { return this.svc.deleteStaff(id); }

  @Post('staff/update')
  updateStaffByBody(@Body() body: any) { return this.svc.updateStaff(body.staff_id, body); }

  @Put('staff/:id') updateStaff(@Param('id') id: string, @Body() body: any) { return this.svc.updateStaff(id, body); }

  @Delete('staff/:id') deleteStaff(@Param('id') id: string) { return this.svc.deleteStaff(id); }

  @Post('staff/:id/verify') verifyStaff(@Param('id') id: string) { return this.svc.verifyStaff(id); }

  @Post('staff/:id/unverify') unverifyStaff(@Param('id') id: string) { return this.svc.unverifyStaff(id); }

  // Sessions
  @Get('sessions') getSessions(@CurrentUser() user: any) { return this.svc.getSessions(user); }
  @Post('sessions') createSession(@CurrentUser() user: any, @Body('session') s: string) { return this.svc.createSession(user, s); }
  @Put('sessions/:session/current') setCurrentSession(@CurrentUser() user: any, @Param('session') s: string) { return this.svc.setCurrentSession(user, s); }
  @Post('sessions/set-current') setCurrentSessionByBody(@CurrentUser() user: any, @Body('name') name: string) { return this.svc.setCurrentSession(user, name); }
  @Delete('sessions/:session') deleteSession(@CurrentUser() user: any, @Param('session') s: string) { return this.svc.deleteSession(user, s); }
  @Post('sessions/delete') deleteSessionByBody(@CurrentUser() user: any, @Body('name') name: string) { return this.svc.deleteSession(user, name); }
  @Get('terms') getTerms(@CurrentUser() user: any) { return this.svc.getTerms(user); }
  @Post('terms') createTerm(@CurrentUser() user: any, @Body() body: { session: string; name: string }) { return this.svc.createTerm(user, body.session, body.name); }
  @Put('terms/:term/current') setCurrentTerm(@Param('term') t: string) { return this.svc.setCurrentTerm(t); }
  @Delete('terms/:id') deleteTerm(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.deleteTerm(user, id); }
  @Put('terms/:id') updateTerm(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) { return this.svc.updateTerm(user, id, body); }

  // Payments
  @Get('payments/pending') getPendingPayments(@CurrentUser() user: any) { return this.svc.getPendingPayments(user); }
  @Get('payments') getAllPayments(@CurrentUser() user: any, @Query() q: any) { return this.svc.getAllPayments(user, q); }
  @Post('payments/:id/verify') verifyPayment(@Param('id') id: string) { return this.svc.verifyPayment(id); }

  // Library
  @Get('library') getLibrary(@CurrentUser() user: any) { return this.svc.getLibrary(user); }
  @Put('library/:id/approve') approveLibrary(@Param('id') id: string) { return this.svc.approveLibrary(id); }
  @Delete('library/:id') deleteLibrary(@Param('id') id: string) { return this.svc.deleteLibrary(id); }

  // Classes
  @Get('classes') getClasses(@CurrentUser() user: any) { return this.svc.getClasses(user); }
  @Post('classes') createClass(@CurrentUser() user: any, @Body() body: any) { return this.svc.createClass(user, body); }
  @Put('classes/:class') updateClass(@CurrentUser() user: any, @Param('class') c: string, @Body() body: any) { return this.svc.updateClass(user, c, body); }
  @Delete('classes/:class') deleteClass(@Param('class') c: string) { return this.svc.deleteClass(c); }

  // Courses
  @Get('courses') getCourses(@CurrentUser() user: any) { return this.svc.getCourses(user); }
  @Post('courses') createCourse(@CurrentUser() user: any, @Body() body: any) { return this.svc.createCourse(user, body); }
  @Put('courses/:id') updateCourse(@Param('id') id: string, @Body() body: any) { return this.svc.updateCourse(id, body); }
  @Delete('courses/:id') deleteCourse(@Param('id') id: string) { return this.svc.deleteCourse(id); }

  // Results
  @Get('results') getResults(@CurrentUser() user: any, @Query() q: any) { return this.svc.getResults(user, q); }
  @Get('results/:student_id') getStudentResults(@CurrentUser() user: any, @Param('student_id') id: string, @Query() q: any) { return this.svc.getStudentResults(user, id, q); }
  @Put('results/:student_id/approve') approveResults(@CurrentUser() user: any, @Param('student_id') id: string, @Body() body: any) { return this.svc.approveResults(user, id, body); }
  @Put('results/:student_id/unapprove') unapproveResults(@CurrentUser() user: any, @Param('student_id') id: string, @Body() body: any) { return this.svc.unapproveResults(user, id, body); }
  @Put('results/:student_id/principal-comment') updatePrincipalComment(@CurrentUser() user: any, @Param('student_id') id: string, @Body() body: any) { return this.svc.updatePrincipalComment(user, id, body); }
  @Post('results/bulk-approve') bulkApprove(@CurrentUser() user: any, @Body() body: any) { return this.svc.bulkApproveResults(user, body); }
  @Post('results/bulk-unapprove') bulkUnapprove(@CurrentUser() user: any, @Body() body: any) { return this.svc.bulkUnapproveResults(user, body); }

  // School Days
  @Get('school-days') getSchoolDays() { return this.svc.getSchoolDays(); }
  @Post('school-days') setSchoolDays(@Body() body: any) { return this.svc.setSchoolDays(body); }
  @Delete('school-days/:session/:term') deleteSchoolDays(@Param('session') s: string, @Param('term') t: string) { return this.svc.deleteSchoolDays(s, t); }

  // Promotion
  @Get('promotions/classes') getPromotionClasses(@CurrentUser() user: any) { return this.svc.getPromotionClasses(user); }
  @Post('promotions/promote') promoteClass(@CurrentUser() user: any, @Body() body: any) { return this.svc.promoteClass(user, body); }
  @Post('promotions/repeat') repeatStudents(@CurrentUser() user: any, @Body() body: any) { return this.svc.repeatStudents(user, body); }
  @Post('promotions/transfer') transferStudent(@CurrentUser() user: any, @Body() body: any) { return this.svc.transferStudent(user, body); }

  @Get('notifications') getNotifications(@CurrentUser() user: any) { return this.svc.getNotifications(user); }
  @Post('notifications/read') markNotificationsRead(@CurrentUser() user: any) { return this.svc.markNotificationsRead(user); }

  // Broadcast
  @Post('broadcast') broadcast(@CurrentUser() user: any, @Body() body: any) { return this.svc.broadcast(user, body); }

  // Exam timetable
  @Get('exam-timetable') getExamTimetable(@CurrentUser() user: any) { return this.svc.getExamTimetables(user); }
  @Post('exam-timetable') createExamTimetable(@CurrentUser() user: any, @Body() body: any) { return this.svc.createExamTimetable(user, body); }
  @Put('exam-timetable/:id') updateExamTimetable(@Param('id') id: string, @Body() body: any) { return this.svc.updateExamTimetable(id, body); }
  @Delete('exam-timetable/:id') deleteExamTimetable(@Param('id') id: string) { return this.svc.deleteExamTimetable(id); }

  // Staff performance
  @Get('staff/performance') getStaffPerformance(@CurrentUser() user: any) { return this.svc.getStaffPerformance(user); }
}
