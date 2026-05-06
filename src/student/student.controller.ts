import { Controller, Get, Post, Put, Body, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { StudentService } from './student.service';
import { StudentGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('student')
@UseGuards(StudentGuard)
export class StudentController {
  constructor(private svc: StudentService) {}

  @Get('dashboard') dashboard(@CurrentUser() user: any) { return this.svc.dashboard(user); }
  @Get('profile') profile(@CurrentUser() user: any) { return this.svc.profile(user); }

  @Put('profile') updateProfile(@CurrentUser() user: any, @Body() body: any) { return this.svc.updateProfile(user, body); }

  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image', { storage: diskStorage({ destination: './uploads', filename: (_, f, cb) => cb(null, `${Date.now()}${extname(f.originalname)}`) }) }))
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
}
