import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { SchoolFeesService } from './school-fees.service';
import { StudentGuard, AdminGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

// ── Student endpoints ──────────────────────────────────────────────────────────
@Controller('student/school-fees')
@UseGuards(StudentGuard)
export class StudentSchoolFeesController {
  constructor(private svc: SchoolFeesService) {}

  @Get()
  getMyFees(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.getStudentFees(user, q);
  }

  @Post('initialize')
  @HttpCode(200)
  initializePayment(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.initializePaystackPayment(user, body);
  }

  // POST verify — called manually from frontend with token
  @Post('verify/:reference')
  @HttpCode(200)
  verifyPayment(@CurrentUser() user: any, @Param('reference') ref: string) {
    return this.svc.verifyPaystackPayment(ref);
  }

  @Get('history')
  getHistory(@CurrentUser() user: any) {
    return this.svc.getPaymentHistory(user.student_id);
  }
}

// ── Public Paystack callback (no auth — Paystack GET redirect) ─────────────────
@Controller('student/school-fees')
export class PaystackCallbackController {
  constructor(private svc: SchoolFeesService) {}

  @Get('verify')
  verifyCallback(@Query('reference') reference: string, @Query('trxref') trxref: string) {
    const ref = reference || trxref;
    return this.svc.verifyPaystackPayment(ref);
  }
}

// ── Admin endpoints ────────────────────────────────────────────────────────────
@Controller('admin/school-fees')
@UseGuards(AdminGuard)
export class AdminSchoolFeesController {
  constructor(private svc: SchoolFeesService) {}

  @Get('config')
  getConfig(@Query() q: any) {
    return this.svc.getFeesConfig(q);
  }

  @Post('config')
  setConfig(@Body() body: any) {
    return this.svc.setFeesConfig(body);
  }

  @Put('config/:id')
  updateConfig(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateFeesConfig(+id, body);
  }

  @Delete('config/:id')
  deleteConfig(@Param('id') id: string) {
    return this.svc.deleteFeesConfig(+id);
  }

  @Get('payments')
  getAllPayments(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.getAllPayments(user, q);
  }

  @Get('payments/summary')
  getSummary(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.getPaymentsSummary(user, q);
  }

  @Get('payments/:student_id')
  getStudentPayments(@Param('student_id') studentId: string) {
    return this.svc.getPaymentHistory(studentId);
  }
}
