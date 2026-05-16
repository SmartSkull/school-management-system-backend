import {
  Controller, Get, Post, Put, Param, Body, Query, Req, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { LeaveService } from './leave.service';
import { JwtAuthGuard, StaffGuard, AdminGuard } from '../common/guards/auth.guard';

const leaveStorage = diskStorage({
  destination: './uploads/leave',
  filename: (_, file, cb) => cb(null, `${Date.now()}${extname(file.originalname)}`),
});

@Controller('leave')
export class LeaveController {
  constructor(private leaveService: LeaveService) {}

  // ── Staff routes ───────────────────────────────────────────────────────
  @UseGuards(StaffGuard)
  @Post('request')
  @UseInterceptors(FileInterceptor('proofFile', { storage: leaveStorage }))
  requestLeave(@Req() req: any, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
    return this.leaveService.requestLeave(req.user, body, file);
  }

  @UseGuards(StaffGuard)
  @Get('my')
  myLeaves(@Req() req: any) {
    return this.leaveService.myLeaves(req.user);
  }

  @UseGuards(StaffGuard)
  @Get('balance')
  myBalance(@Req() req: any) {
    return this.leaveService.myBalance(req.user);
  }

  // ── Admin routes ───────────────────────────────────────────────────────
  @UseGuards(AdminGuard)
  @Get('admin/all')
  getAllLeaves(@Req() req: any, @Query() query: any) {
    return this.leaveService.getAllLeaves(req.user, query);
  }

  @UseGuards(AdminGuard)
  @Put('admin/:id/review')
  reviewLeave(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.leaveService.reviewLeave(req.user, id, body);
  }

  @UseGuards(AdminGuard)
  @Get('admin/balance/:staffId')
  staffBalance(@Req() req: any, @Param('staffId') staffId: string) {
    return this.leaveService.staffBalance(req.user, staffId);
  }

  @UseGuards(AdminGuard)
  @Get('admin/entitlements')
  getEntitlements(@Req() req: any) {
    return this.leaveService.getEntitlements(req.user);
  }

  @UseGuards(AdminGuard)
  @Put('admin/entitlements')
  setEntitlement(@Req() req: any, @Body() body: any) {
    return this.leaveService.setEntitlement(req.user, body);
  }
}
