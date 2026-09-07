import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { TransportService } from './transport.service';
import { AdminGuard, StudentGuard, StaffGuard } from '../common/guards/auth.guard';

@Controller('admin/transport')
@UseGuards(AdminGuard)
export class TransportController {
  constructor(private service: TransportService) {}

  @Get('routes') getRoutes(@Request() req: any) { return this.service.getRoutes(req.user); }
  @Post('routes') createRoute(@Request() req: any, @Body() body: any) { return this.service.createRoute(req.user, body); }
  @Put('routes/:id') updateRoute(@Param('id') id: string, @Body() body: any) { return this.service.updateRoute(id, body); }
  @Delete('routes/:id') deleteRoute(@Param('id') id: string) { return this.service.deleteRoute(id); }

  @Get('drivers') getDrivers(@Request() req: any) { return this.service.getDrivers(req.user); }
  @Post('drivers') createDriver(@Request() req: any, @Body() body: any) { return this.service.createDriver(req.user, body); }
  @Put('drivers/:id') updateDriver(@Param('id') id: string, @Body() body: any) { return this.service.updateDriver(id, body); }
  @Delete('drivers/:id') deleteDriver(@Param('id') id: string) { return this.service.deleteDriver(id); }

  @Get('buses') getBuses(@Request() req: any) { return this.service.getBuses(req.user); }
  @Post('buses') createBus(@Request() req: any, @Body() body: any) { return this.service.createBus(req.user, body); }
  @Put('buses/:id') updateBus(@Param('id') id: string, @Body() body: any) { return this.service.updateBus(id, body); }
  @Delete('buses/:id') deleteBus(@Param('id') id: string) { return this.service.deleteBus(id); }
  @Post('buses/:id/token') regenerateToken(@Param('id') id: string) { return this.service.regenerateDriverToken(id); }
  @Post('buses/:id/trip/start') startTrip(@Param('id') id: string) { return this.service.startTrip(id); }
  @Post('buses/:id/trip/end') endTrip(@Param('id') id: string) { return this.service.endTrip(id); }
  @Post('buses/:id/gps') updateGps(@Param('id') id: string, @Body() body: { lat: number; lng: number }) { return this.service.updateGps(id, body.lat, body.lng); }

  @Post('buses/:id/assign') assignStudent(@Param('id') id: string, @Body() body: { studentId: string }, @Request() req: any) { return this.service.assignStudent(id, body.studentId, req.user); }
  @Post('buses/:id/bulk-assign') bulkAssign(@Param('id') id: string, @Body() body: { studentIds: string[] }, @Request() req: any) { return this.service.bulkAssignStudents(id, body.studentIds, req.user); }
  @Post('unassign') unassignStudent(@Body() body: { studentId: string }, @Request() req: any) { return this.service.unassignStudent(body.studentId, req.user); }

  @Get('fare-payments') getFarePayments(@Request() req: any, @Query('busId') busId?: string) { return this.service.getFarePayments(req.user, busId); }
  @Post('fare-payments') recordFarePayment(@Body() body: { assignmentId: string; amount: number; note?: string }, @Request() req: any) { return this.service.recordFarePayment(body.assignmentId, body.amount, body.note, req.user?.id ? BigInt(req.user.id) : undefined); }

  @Get('bus-fee-payments') getAdminBusFeePayments(@Request() req: any) { return this.service.getAdminBusFeePayments(req.user); }

  @Get('trip-logs') getTripLogs(@Request() req: any) { return this.service.getTripLogs(req.user); }

  @Get('analytics') getAnalytics(@Request() req: any) { return this.service.getAnalytics(req.user); }

  @Put('students/:uniqueId/parent-location') setParentLocation(@Param('uniqueId') id: string, @Body() body: any) { return this.service.setParentLocation(id, body); }
  @Get('students/:uniqueId/parent-location') getParentLocation(@Param('uniqueId') id: string) { return this.service.getParentLocation(id); }
  @Get('parent/tracking-link/:studentUniqueId') getParentTrackingLink(@Param('studentUniqueId') studentUniqueId: string, @Request() req: any) { return this.service.generateParentTrackingLink(req.user, studentUniqueId); }

  @Get('routes/:id/chat') getRouteChat(@Param('id') id: string, @Request() req: any) { return this.service.getRouteChat(req.user, id); }
  @Post('routes/:id/chat') sendRouteChat(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.service.sendRouteChatMessage(req.user, { ...body, routeId: id }); }
  @Post('routes/:id/broadcast') createBroadcast(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.service.createBroadcast(req.user, { ...body, routeId: id }); }
  @Get('routes/:id/broadcasts') getBroadcasts(@Param('id') id: string, @Request() req: any) { return this.service.getRouteBroadcasts(req.user, id); }
  @Delete('broadcasts/:id') deleteBroadcast(@Param('id') id: string, @Request() req: any) { return this.service.deleteBroadcast(req.user, id); }
}

// Public driver endpoints (no admin auth — token-based)
import { Controller as Ctrl, Get as G, Post as P, Body as B, Param as Pm, UseGuards as UG, Request as Req } from '@nestjs/common';

@Ctrl('driver')
export class DriverController {
  constructor(private service: TransportService) {}
  @G('trip/:token') getTripInfo(@Pm('token') token: string) { return this.service.getDriverTripInfo(token); }
  @P('trip/:token/start') startTrip(@Pm('token') token: string) { return this.service.startTripByToken(token); }
  @P('trip/:token/end') endTrip(@Pm('token') token: string) { return this.service.endTripByToken(token); }
  @P('trip/:token/pickup') markPickup(@Pm('token') token: string, @B() body: { studentUniqueId: string; pickedUp: boolean }) {
    return this.service.markPickedUp(token, body.studentUniqueId, body.pickedUp);
  }
}

// Student transport endpoints (JWT student auth)
@Ctrl('student/transport')
@UG(StudentGuard)
export class StudentTransportController {
  constructor(private service: TransportService) {}

  @G('bus') getBusInfo(@Req() req: any) { return this.service.getStudentBusInfo(req.user.uniqueId); }
  @G('eta') getEta(@Req() req: any) { return this.service.getStudentEta(req.user.uniqueId); }
  @P('absent') markAbsent(@Req() req: any, @B() body: { absent: boolean }) { return this.service.markStudentAbsent(req.user.uniqueId, body.absent); }
  @P('home-location') setHomeLocation(@Req() req: any, @B() body: { lat: number; lng: number }) { return this.service.setStudentHomeCoords(req.user.uniqueId, body.lat, body.lng); }
  @G('capacity') getCapacity(@Req() req: any) { return this.service.getStudentBusCapacity(req.user.uniqueId); }
  @G('history') getTripHistory(@Req() req: any) { return this.service.getStudentTripHistory(req.user.uniqueId); }
  @P('geocode') geocode(@B() body: { address: string }) { return this.service.geocodeStudentAddress(body.address); }
  @P('sos') sos(@Req() req: any, @B() body: { lat: number; lng: number }) { return this.service.sendSosAlert(req.user.uniqueId, body.lat, body.lng); }
  @G('routes/:id/chat') getRouteChat(@Pm('id') id: string, @Req() req: any) { return this.service.getRouteChat(req.user, id); }
  @P('routes/:id/chat') sendRouteChat(@Pm('id') id: string, @B() body: any, @Req() req: any) { return this.service.sendRouteChatMessage(req.user, { ...body, routeId: id }); }
  @G('routes/:id/broadcasts') getBroadcasts(@Pm('id') id: string, @Req() req: any) { return this.service.getRouteBroadcasts(req.user, id); }
  @G('parent/tracking-link') getParentTrackingLink(@Req() req: any) { return this.service.generateParentTrackingLink(req.user, req.user.uniqueId); }
  @P('left-without-me') reportLeftWithoutMe(@Req() req: any, @B() body: any) { return this.service.reportLeftWithoutMe(req.user.uniqueId, body); }
}

// Staff transport view (read-only)
import { Controller as C2, Get as G2, UseGuards as UG2, Request as Req2 } from '@nestjs/common';

@C2('staff/transport')
@UG2(StaffGuard)
export class StaffTransportController {
  constructor(private service: TransportService) {}
  @G2('overview') getOverview(@Req2() req: any) { return this.service.getStaffTransportOverview(req.user); }
  @G2('driver-dashboard') getDriverDashboard(@Req2() req: any) { return this.service.getDriverDashboard(req.user.uniqueId); }
  @G2('routes/:id/chat') getRouteChat(@Pm('id') id: string, @Req2() req: any) { return this.service.getRouteChat(req.user, id); }
  @G2('routes/:id/broadcasts') getBroadcasts(@Pm('id') id: string, @Req2() req: any) { return this.service.getRouteBroadcasts(req.user, id); }
}

// Public bus fee callback (Paystack GET redirect — no auth)
import { Controller as C3, Get as G3, Query as Q3 } from '@nestjs/common';

@C3('student/transport')
export class BusFeeCallbackController {
  constructor(private service: TransportService) {}
  @G3('bus-fee/callback') callback(@Q3('reference') reference: string, @Q3('trxref') trxref: string) {
    return this.service.verifyBusFeePayment(reference || trxref);
  }
}


// ── Public parent pickup confirmation endpoint (no auth — email link) ──────
import { Controller as C4, Get as G4, Param as Pm4, Query as Q4, Res as Res4 } from '@nestjs/common';
import type { Response } from 'express';

@C4('transport')
export class ParentPickupConfirmController {
  constructor(private service: TransportService) {}

  @G4('parent-confirm/:token')
  async confirm(
    @Pm4('token') token: string,
    @Q4('action') action: string,
    @Res4() res: Response,
  ) {
    const boarded = action?.toUpperCase() === 'YES';
    const result  = await this.service.handleParentPickupConfirm(token, boarded);
    // Return a simple HTML page so the parent sees a clear confirmation message
    const color   = boarded ? '#16a34a' : '#dc2626';
    const icon    = boarded ? '✅' : '❌';
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Pickup Confirmation</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center}.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:700;color:${color};margin-bottom:8px}.msg{color:#6b7280;font-size:15px;line-height:1.6}</style>
    </head><body><div class="card">
      <div class="icon">${icon}</div>
      <div class="title">${result.confirmed ? 'Confirmed' : 'Noted'}</div>
      <div class="msg">${result.message}</div>
      <p style="margin-top:24px;font-size:12px;color:#94a3b8">You can close this page.</p>
    </div></body></html>`);
  }
}
