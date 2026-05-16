import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard, StaffGuard } from '../common/guards/auth.guard';
import { PayrollService } from './payroll.service';

@Controller('payroll')
export class PayrollController {
  constructor(private payroll: PayrollService) {}

  @UseGuards(AdminGuard)
  @Get('admin/salary-setups')
  getSalarySetups(@Req() req: any) {
    return this.payroll.getSalarySetups(req.user);
  }

  @UseGuards(AdminGuard)
  @Put('admin/salary-setups/:staffId')
  saveSalarySetup(@Req() req: any, @Param('staffId') staffId: string, @Body() body: any) {
    return this.payroll.saveSalarySetup(req.user, staffId, body);
  }

  @UseGuards(AdminGuard)
  @Get('admin/deductions')
  getDeductions(@Req() req: any, @Query() query: any) {
    return this.payroll.getDeductions(req.user, query);
  }

  @UseGuards(AdminGuard)
  @Post('admin/deductions')
  createDeduction(@Req() req: any, @Body() body: any) {
    return this.payroll.createDeduction(req.user, body);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/deductions/:id')
  deleteDeduction(@Req() req: any, @Param('id') id: string) {
    return this.payroll.deleteDeduction(req.user, id);
  }

  @UseGuards(AdminGuard)
  @Get('admin/payslips')
  getPayslips(@Req() req: any, @Query() query: any) {
    return this.payroll.getPayslips(req.user, query);
  }

  @UseGuards(AdminGuard)
  @Post('admin/payslips/run')
  runPayroll(@Req() req: any, @Body() body: any) {
    return this.payroll.runPayroll(req.user, body);
  }

  @UseGuards(AdminGuard)
  @Put('admin/payslips/:id/status')
  updatePayslipStatus(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.payroll.updatePayslipStatus(req.user, id, body.status);
  }

  @UseGuards(StaffGuard)
  @Get('my-payslips')
  getMyPayslips(@Req() req: any, @Query() query: any) {
    return this.payroll.getMyPayslips(req.user, query);
  }
}
