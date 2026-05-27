import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private db: PrismaService) {}

  async getReports(schoolId: bigint) {
    const manualIncomes = await this.db.income.findMany({ where: { schoolId } });
    const feePayments = await this.db.schoolFeePayment.findMany({
      where: { student: { user: { schoolId } }, status: 'SUCCESS' },
    });
    
    const manualExpenses = await this.db.expense.findMany({ where: { schoolId } });
    const payslips = await this.db.payrollPayslip.findMany({
      where: { staff: { user: { schoolId } }, status: 'PAID' },
    });
    
    const totalManualIncome = manualIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalFeeIncome = feePayments.reduce((sum, p) => sum + Number(p.amount), 0);
    
    const totalManualExpense = manualExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalPayrollExpense = payslips.reduce((sum, p) => sum + Number(p.netPay), 0);
    
    const totalIncome = totalManualIncome + totalFeeIncome;
    const totalExpense = totalManualExpense + totalPayrollExpense;
    
    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      breakdown: {
        totalManualIncome,
        totalFeeIncome,
        totalManualExpense,
        totalPayrollExpense
      }
    };
  }
  
  async getIncomes(schoolId: bigint) {
    const manual = await this.db.income.findMany({
      where: { schoolId },
      orderBy: { date: 'desc' }
    });
    const fees = await this.db.schoolFeePayment.findMany({
      where: { student: { user: { schoolId } }, status: 'SUCCESS' },
      include: { student: { include: { user: true, classRoom: true } }, session: true, term: true },
      orderBy: { paidAt: 'desc' }
    });
    return { manual, fees };
  }

  async addIncome(data: any) {
    return this.db.income.create({ data: {
      schoolId: data.schoolId,
      amount: data.amount,
      category: data.category,
      reference: data.reference,
      description: data.description,
      date: new Date(data.date),
    } });
  }

  async getExpenses(schoolId: bigint) {
    const manual = await this.db.expense.findMany({
      where: { schoolId },
      orderBy: { date: 'desc' }
    });
    const payroll = await this.db.payrollPayslip.findMany({
      where: { staff: { user: { schoolId } }, status: 'PAID' },
      include: { staff: { include: { user: true } } },
      orderBy: { generatedAt: 'desc' }
    });
    return { manual, payroll };
  }
  
  async addExpense(data: any) {
    return this.db.expense.create({ data: {
      schoolId: data.schoolId,
      amount: data.amount,
      category: data.category,
      reference: data.reference,
      description: data.description,
      date: new Date(data.date),
    } });
  }

  async getOutstandingDebts(schoolId: bigint) {
    const configs = await this.db.schoolFeeConfig.findMany({
      where: { classRoom: { schoolId } },
      include: { classRoom: { include: { students: { include: { user: true } } } }, session: true, term: true }
    });
    
    const payments = await this.db.schoolFeePayment.findMany({
      where: { student: { user: { schoolId } }, status: 'SUCCESS' },
    });
    
    const debts = [];
    
    for (const config of configs) {
      for (const student of config.classRoom.students) {
        const studentPayments = payments.filter(p => 
          p.studentId === student.id && 
          p.sessionId === config.sessionId && 
          p.termId === config.termId
        );
        const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(config.amount) - totalPaid;
        
        if (balance > 0) {
          debts.push({
            student: {
              id: student.id,
              firstName: student.user.firstName,
              lastName: student.user.lastName,
              studentNo: student.studentNo,
            },
            session: config.session,
            term: config.term,
            classRoom: config.classRoom,
            amountBilled: Number(config.amount),
            amountPaid: totalPaid,
            balance
          });
        }
      }
    }
    
    return debts;
  }
}
