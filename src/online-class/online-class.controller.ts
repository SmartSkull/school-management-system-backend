import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OnlineClassService } from './online-class.service';
import { JwtAuthGuard, StaffGuard, StudentGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller()
export class OnlineClassController {
  constructor(private svc: OnlineClassService) {}

  @Post('staff/online-classes')
  @UseGuards(StaffGuard)
  create(@CurrentUser() user: any, @Body() dto: { title: string; className: string; scheduledAt: string; durationMinutes: number }) {
    return this.svc.create(user, dto);
  }

  @Get('staff/online-classes')
  @UseGuards(StaffGuard)
  listStaff(@CurrentUser() user: any, @Query('class') className?: string) {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    return this.svc.findAll(BigInt(schoolId), className);
  }

  @Delete('staff/online-classes/:id')
  @UseGuards(StaffGuard)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.delete(Number(id));
  }

  @Get('student/online-classes')
  @UseGuards(StudentGuard)
  listStudent(@CurrentUser() user: any, @Query('class') className?: string) {
    const schoolId = user.schoolId ?? user.user?.schoolId;
    const studentClass = className ?? user.student?.classRoom?.name;
    return this.svc.findAll(BigInt(schoolId), studentClass);
  }
}
