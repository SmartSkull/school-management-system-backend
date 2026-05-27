import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AdminGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('admin/finance')
@UseGuards(AdminGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('reports')
  async getReports(@CurrentUser() user: any) {
    const schoolId = user.schoolId;
    return {
      success: true,
      data: await this.financeService.getReports(BigInt(schoolId)),
    };
  }

  @Get('income')
  async getIncome(@CurrentUser() user: any) {
    const schoolId = user.schoolId;
    return {
      success: true,
      data: await this.financeService.getIncomes(BigInt(schoolId)),
    };
  }

  @Post('income')
  async addIncome(@CurrentUser() user: any, @Body() body: any) {
    const schoolId = user.schoolId;
    return {
      success: true,
      data: await this.financeService.addIncome({ ...body, schoolId: BigInt(schoolId) }),
    };
  }

  @Get('expenses')
  async getExpenses(@CurrentUser() user: any) {
    const schoolId = user.schoolId;
    return {
      success: true,
      data: await this.financeService.getExpenses(BigInt(schoolId)),
    };
  }

  @Post('expenses')
  async addExpense(@CurrentUser() user: any, @Body() body: any) {
    const schoolId = user.schoolId;
    return {
      success: true,
      data: await this.financeService.addExpense({ ...body, schoolId: BigInt(schoolId) }),
    };
  }

  @Get('debts')
  async getOutstandingDebts(@CurrentUser() user: any) {
    const schoolId = user.schoolId;
    return {
      success: true,
      data: await this.financeService.getOutstandingDebts(BigInt(schoolId)),
    };
  }
}
