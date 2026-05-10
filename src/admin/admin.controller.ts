import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private svc: AdminService) {}

  @Get('dashboard') dashboard() { return this.svc.dashboard(); }

  // Students
  @Get('students')
  getStudents(@Query() q: any) { return this.svc.getStudents(q); }

  @Post('students')
  createStudent(@Body() body: any) { return this.svc.createStudent(body); }

  @Post('students/bulk-verify')
  bulkVerify(@Body('student_ids') ids: string[]) { return this.svc.bulkVerifyStudents(ids); }

  @Post('students/verify')
  verifyStudentByBody(@Body('student_id') id: string) { return this.svc.verifyStudent(id); }

  @Post('students/delete')
  deleteStudentByBody(@Body('student_id') id: string) { return this.svc.deleteStudent(id); }

  @Post('students/update')
  updateStudentByBody(@Body() body: any) { return this.svc.updateStudent(body.student_id, body); }

  @Put('students/:id/verify')
  verifyStudent(@Param('id') id: string) { return this.svc.verifyStudent(id); }

  @Put('students/:id')
  updateStudent(@Param('id') id: string, @Body() body: any) { return this.svc.updateStudent(id, body); }

  @Delete('students/:id')
  deleteStudent(@Param('id') id: string) { return this.svc.deleteStudent(id); }

  // Staff
  @Get('staff') getStaff(@Query() q: any) { return this.svc.getStaff(q); }

  @Post('staff') createStaff(@Body() body: any) { return this.svc.createStaff(body); }

  @Post('staff/verify')
  verifyStaffByBody(@Body('staff_id') id: string) { return this.svc.verifyStaff(id); }

  @Post('staff/delete')
  deleteStaffByBody(@Body('staff_id') id: string) { return this.svc.deleteStaff(id); }

  @Post('staff/update')
  updateStaffByBody(@Body() body: any) { return this.svc.updateStaff(body.staff_id, body); }

  @Put('staff/:id') updateStaff(@Param('id') id: string, @Body() body: any) { return this.svc.updateStaff(id, body); }

  @Delete('staff/:id') deleteStaff(@Param('id') id: string) { return this.svc.deleteStaff(id); }

  @Post('staff/:id/verify') verifyStaff(@Param('id') id: string) { return this.svc.verifyStaff(id); }

  // Sessions & Terms
  @Get('sessions') getSessions() { return this.svc.getSessions(); }
  @Post('sessions') createSession(@Body('session') s: string) { return this.svc.createSession(s); }
  @Put('sessions/:session/current') setCurrentSession(@Param('session') s: string) { return this.svc.setCurrentSession(s); }
  @Post('sessions/set-current') setCurrentSessionByBody(@Body('name') name: string) { return this.svc.setCurrentSession(name); }
  @Delete('sessions/:session') deleteSession(@Param('session') s: string) { return this.svc.deleteSession(s); }
  @Post('sessions/delete') deleteSessionByBody(@Body('name') name: string) { return this.svc.deleteSession(name); }
  @Get('terms') getTerms() { return this.svc.getTerms(); }
  @Put('terms/:term/current') setCurrentTerm(@Param('term') t: string) { return this.svc.setCurrentTerm(t); }
  @Delete('terms/:id') deleteTerm(@Param('id') id: string) { return this.svc.deleteTerm(id); }
  @Put('terms/:id') updateTerm(@Param('id') id: string, @Body() body: any) { return this.svc.updateTerm(id, body); }

  // Payments
  @Get('payments/pending') getPendingPayments() { return this.svc.getPendingPayments(); }
  @Get('payments') getAllPayments(@Query() q: any) { return this.svc.getAllPayments(q); }
  @Post('payments/:id/verify') verifyPayment(@Param('id') id: string) { return this.svc.verifyPayment(id); }

  // Library
  @Get('library') getLibrary() { return this.svc.getLibrary(); }
  @Put('library/:id/approve') approveLibrary(@Param('id') id: string) { return this.svc.approveLibrary(id); }
  @Delete('library/:id') deleteLibrary(@Param('id') id: string) { return this.svc.deleteLibrary(id); }

  // Classes
  @Get('classes') getClasses() { return this.svc.getClasses(); }
  @Post('classes') createClass(@Body() body: any) { return this.svc.createClass(body); }
  @Put('classes/:class') updateClass(@Param('class') c: string, @Body() body: any) { return this.svc.updateClass(c, body); }
  @Delete('classes/:class') deleteClass(@Param('class') c: string) { return this.svc.deleteClass(c); }

  // Courses
  @Get('courses') getCourses() { return this.svc.getCourses(); }
  @Post('courses') createCourse(@Body() body: any) { return this.svc.createCourse(body); }
  @Put('courses/:course') updateCourse(@Param('course') c: string, @Body() body: any) { return this.svc.updateCourse(c, body); }
  @Delete('courses/:course') deleteCourse(@Param('course') c: string) { return this.svc.deleteCourse(c); }

  // Results
  @Get('results') getResults(@Query() q: any) { return this.svc.getResults(q); }
  @Get('results/:student_id') getStudentResults(@Param('student_id') id: string, @Query() q: any) { return this.svc.getStudentResults(id, q); }
  @Put('results/:student_id/approve') approveResults(@Param('student_id') id: string, @Body() body: any) { return this.svc.approveResults(id, body); }
  @Put('results/:student_id/unapprove') unapproveResults(@Param('student_id') id: string, @Body() body: any) { return this.svc.unapproveResults(id, body); }
  @Put('results/:student_id/principal-comment') updatePrincipalComment(@Param('student_id') id: string, @Body() body: any) { return this.svc.updatePrincipalComment(id, body); }
  @Post('results/bulk-approve') bulkApprove(@Body() body: any) { return this.svc.bulkApproveResults(body); }
  @Post('results/bulk-unapprove') bulkUnapprove(@Body() body: any) { return this.svc.bulkUnapproveResults(body); }

  // School Days
  @Get('school-days') getSchoolDays() { return this.svc.getSchoolDays(); }
  @Post('school-days') setSchoolDays(@Body() body: any) { return this.svc.setSchoolDays(body); }
  @Delete('school-days/:session/:term') deleteSchoolDays(@Param('session') s: string, @Param('term') t: string) { return this.svc.deleteSchoolDays(s, t); }

  @Get('notifications') getNotifications(@CurrentUser() user: any) { return this.svc.getNotifications(user); }
  @Post('notifications/read') markNotificationsRead(@CurrentUser() user: any) { return this.svc.markNotificationsRead(user); }
}
