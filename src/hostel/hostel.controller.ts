import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { HostelService } from './hostel.service';
import { AdminGuard, StudentGuard } from '../common/guards/auth.guard';

@Controller('student/hostel')
@UseGuards(StudentGuard)
export class StudentHostelController {
  constructor(private service: HostelService) {}

  @Get()
  getMyHostel(@Request() req: any) { return this.service.getStudentHostelInfo(req.user); }
}

@Controller('admin/hostel')
@UseGuards(AdminGuard)
export class HostelController {
  constructor(private service: HostelService) {}

  @Get()
  getHostels(@Request() req: any) { return this.service.getHostels(req.user); }

  @Post()
  createHostel(@Request() req: any, @Body() body: any) { return this.service.createHostel(req.user, body); }

  @Put(':id')
  updateHostel(@Param('id') id: string, @Body() body: any) { return this.service.updateHostel(id, body); }

  @Delete(':id')
  deleteHostel(@Param('id') id: string) { return this.service.deleteHostel(id); }

  @Post('rooms')
  createRoom(@Body() body: any) { return this.service.createRoom(body); }

  @Delete('rooms/:id')
  deleteRoom(@Param('id') id: string) { return this.service.deleteRoom(id); }

  @Post('beds/:id/assign')
  assignBed(@Param('id') id: string, @Body() body: { studentId: string }, @Request() req: any) {
    return this.service.assignBed(id, body.studentId, req.user);
  }

  @Post('beds/:id/unassign')
  unassignBed(@Param('id') id: string) { return this.service.unassignBed(id); }

  @Get('attendance')
  getAttendance(@Request() req: any, @Query('date') date?: string) { return this.service.getAttendance(req.user, date); }

  @Post('attendance')
  markAttendance(@Request() req: any, @Body() body: any) { return this.service.markAttendance(req.user, body); }
}
