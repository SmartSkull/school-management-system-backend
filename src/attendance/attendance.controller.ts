import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { StaffGuard, AdminGuard, StudentGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('attendance')
export class AttendanceController {
  constructor(private svc: AttendanceService) {}

  // ── Staff endpoints ────────────────────────────────────────────────────
  @Post('clock-in')
  @UseGuards(StaffGuard)
  clockIn(@CurrentUser() user: any, @Body() body: { latitude: number; longitude: number }) {
    return this.svc.clockIn(user, body);
  }

  @Post('clock-out')
  @UseGuards(StaffGuard)
  clockOut(@CurrentUser() user: any, @Body() body: { latitude: number; longitude: number }) {
    return this.svc.clockOut(user, body);
  }

  @Get('today')
  @UseGuards(StaffGuard)
  todayStatus(@CurrentUser() user: any) {
    return this.svc.todayStatus(user);
  }

  @Get('history')
  @UseGuards(StaffGuard)
  myHistory(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.myHistory(user, q);
  }

  // ── Student endpoints ──────────────────────────────────────────────────
  @Post('student/clock-in')
  @UseGuards(StudentGuard)
  studentClockIn(@CurrentUser() user: any, @Body() body: { latitude: number; longitude: number }) {
    return this.svc.studentClockIn(user, body);
  }

  @Post('student/clock-out')
  @UseGuards(StudentGuard)
  studentClockOut(@CurrentUser() user: any, @Body() body: { latitude: number; longitude: number }) {
    return this.svc.studentClockOut(user, body);
  }

  @Get('student/today')
  @UseGuards(StudentGuard)
  studentTodayStatus(@CurrentUser() user: any) {
    return this.svc.studentTodayStatus(user);
  }

  @Get('student/history')
  @UseGuards(StudentGuard)
  studentHistory(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.studentHistory(user, q);
  }

  // ── Admin endpoints ────────────────────────────────────────────────────
  @Post('admin/location')
  @UseGuards(AdminGuard)
  setLocation(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.setLocation(user, body);
  }

  @Get('admin/location')
  @UseGuards(AdminGuard)
  getLocation(@CurrentUser() user: any) {
    return this.svc.getLocation(user);
  }

  @Get('admin/report')
  @UseGuards(AdminGuard)
  getReport(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.getReport(user, q);
  }

  @Post('admin/mark-absent')
  @UseGuards(AdminGuard)
  markAbsent(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.markAbsent(user, body);
  }

  @Get('admin/student-report')
  @UseGuards(AdminGuard)
  getStudentReport(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.getStudentReport(user, q);
  }

  @Post('admin/mark-students-absent')
  @UseGuards(AdminGuard)
  markStudentsAbsent(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.markStudentsAbsent(user, body);
  }

  // ── Staff: mark student attendance ────────────────────────────────────
  @Get('staff/students/history-dates')
  @UseGuards(StaffGuard)
  staffStudentAttendanceDates(@CurrentUser() user: any, @Query('month') month?: string, @Query('year') year?: string) {
    return this.svc.staffStudentAttendanceDates(user, month, year);
  }

  @Get('staff/students')
  @UseGuards(StaffGuard)
  staffGetStudentAttendance(@CurrentUser() user: any, @Query('class') className?: string, @Query('date') date?: string) {
    return this.svc.staffGetStudentAttendance(user, className, date);
  }

  @Post('staff/students')
  @UseGuards(StaffGuard)
  staffMarkStudentAttendance(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.staffMarkStudentAttendance(user, body);
  }
}
