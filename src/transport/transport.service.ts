import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../common/email.service';
import { TransportGateway } from './transport.gateway';
import * as crypto from 'crypto';

const PROXIMITY_METERS = 500;   // approach alert radius
const PICKUP_METERS    = 50;    // pickup confirmation radius
const DWELL_MS         = 15_000; // bus must stay within PICKUP_METERS for this long

// Per-bus dwell tracker: busId → studentUniqueId → firstSeenAt
const dwellTracker = new Map<string, Map<string, number>>();

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class TransportService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    @Inject(forwardRef(() => TransportGateway)) private gateway: TransportGateway,
  ) {}

  private ok(data: any = null, message = 'Success') { return { success: true, data, message }; }
  private sid(user: any): bigint | undefined { return user?.schoolId ? BigInt(user.schoolId) : undefined; }

  // ── Routes ────────────────────────────────────────────────────────────────

  async getRoutes(user: any) {
    const schoolId = this.sid(user);
    return this.ok(await this.prisma.transportRoute.findMany({
      where: schoolId ? { schoolId } : {},
      include: { buses: { include: { driver: true, assignments: true } } },
      orderBy: { name: 'asc' },
    }));
  }

  async createRoute(user: any, body: { name: string; description?: string; fare?: number }) {
    const schoolId = this.sid(user);
    return this.ok(await this.prisma.transportRoute.create({
      data: { name: body.name, description: body.description, fare: body.fare ?? 0, ...(schoolId ? { schoolId } : {}) },
    }), 'Route created');
  }

  async updateRoute(id: string, body: { name?: string; description?: string; fare?: number; polyline?: any }) {
    if (!await this.prisma.transportRoute.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Route not found');
    return this.ok(await this.prisma.transportRoute.update({ where: { id: BigInt(id) }, data: body }), 'Route updated');
  }

  async deleteRoute(id: string) {
    if (!await this.prisma.transportRoute.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Route not found');
    await this.prisma.transportRoute.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Route deleted');
  }

  // ── Drivers ───────────────────────────────────────────────────────────────

  async getDrivers(user: any) {
    const schoolId = this.sid(user);
    return this.ok(await this.prisma.transportDriver.findMany({
      where: schoolId ? { schoolId } : {},
      include: { buses: { select: { id: true, plateNumber: true, driverToken: true } }, user: { select: { uniqueId: true, firstName: true, lastName: true } } },
      orderBy: { name: 'asc' },
    }));
  }

  async createDriver(user: any, body: { name: string; phone?: string; licenseNo?: string; userId?: string }) {
    const schoolId = this.sid(user);
    const userRecord = body.userId ? await this.prisma.user.findUnique({ where: { uniqueId: body.userId }, select: { id: true } }) : null;
    return this.ok(await this.prisma.transportDriver.create({
      data: { name: body.name, phone: body.phone, licenseNo: body.licenseNo, ...(userRecord ? { userId: userRecord.id } : {}), ...(schoolId ? { schoolId } : {}) },
    }), 'Driver added');
  }

  async updateDriver(id: string, body: { name?: string; phone?: string; licenseNo?: string; userId?: string | null }) {
    if (!await this.prisma.transportDriver.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Driver not found');
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.licenseNo !== undefined) data.licenseNo = body.licenseNo;
    if (body.userId !== undefined) {
      if (body.userId) {
        const u = await this.prisma.user.findUnique({ where: { uniqueId: body.userId }, select: { id: true } });
        if (u) data.userId = u.id;
      } else {
        data.userId = null;
      }
    }
    return this.ok(await this.prisma.transportDriver.update({ where: { id: BigInt(id) }, data }), 'Driver updated');
  }

  async deleteDriver(id: string) {
    if (!await this.prisma.transportDriver.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Driver not found');
    await this.prisma.transportDriver.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Driver deleted');
  }

  // ── Buses ─────────────────────────────────────────────────────────────────

  async getBuses(user: any) {
    const schoolId = this.sid(user);
    return this.ok(await this.prisma.transportBus.findMany({
      where: schoolId ? { schoolId } : {},
      include: {
        route: { select: { id: true, name: true, polyline: true } },
        driver: { select: { id: true, name: true, phone: true } },
        assignments: {
          select: {
            id: true,
            absentToday: true,
            pickedUp: true,
            pickedUpAt: true,
            student: { select: { parentLat: true, parentLng: true, user: { select: { uniqueId: true, firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { plateNumber: 'asc' },
    }));
  }

  async createBus(user: any, body: { plateNumber: string; capacity?: number; routeId?: string; driverId?: string }) {
    const schoolId = this.sid(user);
    const driverToken = crypto.randomBytes(32).toString('hex');
    return this.ok(await this.prisma.transportBus.create({
      data: {
        plateNumber: body.plateNumber, capacity: body.capacity ?? 40, driverToken,
        ...(body.routeId ? { routeId: BigInt(body.routeId) } : {}),
        ...(body.driverId ? { driverId: BigInt(body.driverId) } : {}),
        ...(schoolId ? { schoolId } : {}),
      },
    }), 'Bus added');
  }

  async updateBus(id: string, body: { plateNumber?: string; capacity?: number; routeId?: string | null; driverId?: string | null }) {
    if (!await this.prisma.transportBus.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Bus not found');
    return this.ok(await this.prisma.transportBus.update({
      where: { id: BigInt(id) },
      data: {
        ...(body.plateNumber ? { plateNumber: body.plateNumber } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        routeId: body.routeId === null ? null : body.routeId ? BigInt(body.routeId) : undefined,
        driverId: body.driverId === null ? null : body.driverId ? BigInt(body.driverId) : undefined,
      },
    }), 'Bus updated');
  }

  async deleteBus(id: string) {
    if (!await this.prisma.transportBus.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Bus not found');
    await this.prisma.transportBus.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Bus deleted');
  }

  async regenerateDriverToken(id: string) {
    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.transportBus.update({ where: { id: BigInt(id) }, data: { driverToken: token } });
    return this.ok({ token }, 'Token regenerated');
  }

  // ── Trip ──────────────────────────────────────────────────────────────────

  async startTrip(id: string) {
    if (!await this.prisma.transportBus.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Bus not found');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    await this.prisma.transportAssignment.updateMany({ where: { busId: BigInt(id) }, data: { alertedAt: null, pickedUp: false, pickedUpAt: null } });
    await this.prisma.transportBus.update({ where: { id: BigInt(id) }, data: { tripActive: true, tripDate: today } });
    return this.ok(null, 'Trip started');
  }

  async endTrip(id: string) {
    await this.prisma.transportBus.update({ where: { id: BigInt(id) }, data: { tripActive: false } });
    dwellTracker.delete(id); // clear dwell state for this bus
    return this.ok(null, 'Trip ended');
  }

  async startTripByToken(token: string) {
    const bus = await this.getBusByDriverToken(token);
    if (!bus) throw new NotFoundException('Invalid token');
    return this.startTrip(String(bus.id));
  }

  async endTripByToken(token: string) {
    const bus = await this.getBusByDriverToken(token);
    if (!bus) throw new NotFoundException('Invalid token');
    return this.endTrip(String(bus.id));
  }

  async markPickedUp(token: string, studentUniqueId: string, pickedUp: boolean) {
    const bus = await this.getBusByDriverToken(token);
    if (!bus) throw new NotFoundException('Invalid token');
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { busId: bus.id, student: { user: { uniqueId: studentUniqueId } } },
    });
    if (!assignment) throw new NotFoundException('Student not on this bus');
    const pickedUpAt = pickedUp ? new Date() : null;
    await this.prisma.transportAssignment.update({
      where: { id: assignment.id },
      data: { pickedUp, pickedUpAt },
    });
    // broadcast to admin watchers
    if (this.gateway) {
      this.gateway.broadcastPickup(String(bus.id), studentUniqueId, pickedUp, pickedUpAt?.toISOString() ?? null);
    }
    return this.ok(null, pickedUp ? 'Marked as picked up' : 'Marked as not picked up');
  }

  async getBusByDriverToken(token: string) {
    return this.prisma.transportBus.findUnique({
      where: { driverToken: token },
      include: { route: true, driver: true, school: true },
    });
  }

  async getDriverTripInfo(token: string) {
    const bus = await this.getBusByDriverToken(token);
    if (!bus) throw new NotFoundException('Invalid driver token');
    return this.ok({
      busId: String(bus.id),
      plateNumber: bus.plateNumber,
      routeName: (bus.route as any)?.name,
      driverName: (bus.driver as any)?.name,
      tripActive: bus.tripActive,
      schoolName: (bus.school as any)?.name,
    });
  }

  // ── GPS + proximity check ─────────────────────────────────────────────────

  async updateGps(id: string, lat: number, lng: number) {
    if (!await this.prisma.transportBus.findUnique({ where: { id: BigInt(id) } })) throw new NotFoundException('Bus not found');
    await this.updateGpsAndCheckProximity(id, lat, lng);
    return this.ok(null, 'GPS updated');
  }

  async updateGpsAndCheckProximity(busId: string, lat: number, lng: number) {
    await this.prisma.transportBus.update({
      where: { id: BigInt(busId) },
      data: { gpsLat: lat, gpsLng: lng, gpsUpdatedAt: new Date() },
    });

    const bus = await this.prisma.transportBus.findUnique({
      where: { id: BigInt(busId) },
      include: {
        school: true,
        route: true,
        assignments: {
          where: { absentToday: false, pickedUp: false },
          include: { student: { include: { user: true } } },
        },
      },
    });
    if (!bus?.tripActive) return;

    if (!dwellTracker.has(busId)) dwellTracker.set(busId, new Map());
    const busTracker = dwellTracker.get(busId)!;
    const now = Date.now();

    for (const a of bus.assignments) {
      const s = a.student;
      if (!s.parentLat || !s.parentLng) continue;

      const dist = haversineMeters(lat, lng, Number(s.parentLat), Number(s.parentLng));
      const uid = s.user.uniqueId;

      // ── Approach alert (existing behaviour, 500m) ───────────────────────
      if (dist <= PROXIMITY_METERS && !a.alertedAt) {
        await this.prisma.transportAssignment.update({ where: { id: a.id }, data: { alertedAt: new Date() } });
        this.email.sendBusProximityAlert({
          parentEmail: s.user.email ?? s.parentEmail ?? '',
          studentName: `${s.user.firstName} ${s.user.lastName}`,
          plateNumber: bus.plateNumber,
          routeName: (bus.route as any)?.name,
          distanceMeters: Math.round(dist),
          schoolName: (bus.school as any)?.name ?? 'School',
        });
      }

      // ── Pickup detection (50m + dwell) ──────────────────────────────────
      if (dist <= PICKUP_METERS) {
        if (!busTracker.has(uid)) {
          busTracker.set(uid, now); // first time within 50m
        } else if (now - busTracker.get(uid)! >= DWELL_MS) {
          // Bus has been within 50m for ≥15 s → confirm pickup
          busTracker.delete(uid);
          const pickedUpAt = new Date();
          await this.prisma.transportAssignment.update({
            where: { id: a.id },
            data: { pickedUp: true, pickedUpAt },
          });
          // Broadcast to admin watchers
          if (this.gateway) {
            this.gateway.broadcastPickup(busId, uid, true, pickedUpAt.toISOString());
          }
          // Email parent
          const parentEmail = s.parentEmail ?? s.user.email ?? '';
          this.email.sendStudentPickedUp({
            parentEmail,
            studentName: `${s.user.firstName} ${s.user.lastName}`,
            plateNumber: bus.plateNumber,
            routeName: (bus.route as any)?.name,
            pickedUpAt,
            schoolName: (bus.school as any)?.name ?? 'School',
          });
        }
      } else {
        // Bus moved away — reset dwell timer for this student
        busTracker.delete(uid);
      }
    }
  }

  // ── Parent location ───────────────────────────────────────────────────────

  async setParentLocation(studentUniqueId: string, body: { parentEmail: string; parentLat: number; parentLng: number; homeAddress?: string }) {
    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: studentUniqueId } } });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.student.update({
      where: { id: student.id },
      data: { parentEmail: body.parentEmail, parentLat: body.parentLat, parentLng: body.parentLng, homeAddress: body.homeAddress },
    });
    return this.ok(null, 'Parent location saved');
  }

  async getParentLocation(studentUniqueId: string) {
    const student = await this.prisma.student.findFirst({
      where: { user: { uniqueId: studentUniqueId } },
      select: { parentEmail: true, parentLat: true, parentLng: true, homeAddress: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.ok(student);
  }

  // ── Student transport view ────────────────────────────────────────────────

  async getStudentBusInfo(studentUniqueId: string) {
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { student: { user: { uniqueId: studentUniqueId } } },
      include: {
        bus: { include: { route: true, driver: { include: { user: true } }, school: true } },
        student: true,
      },
    });
    if (!assignment) return this.ok(null, 'No bus assigned');
    const bus = assignment.bus as any;
    const student = assignment.student as any;

    // Auto-geocode homeAddress → parentLat/parentLng if not already done
    if ((!student.parentLat || !student.parentLng) && student.homeAddress) {
      const coords = await this.geocodeAddress(student.homeAddress);
      if (coords) {
        await this.prisma.student.update({
          where: { id: student.id },
          data: { parentLat: coords.lat, parentLng: coords.lng },
        });
        student.parentLat = coords.lat;
        student.parentLng = coords.lng;
      }
    }

    return this.ok({
      busId: String(bus.id),
      plateNumber: bus.plateNumber,
      routeName: bus.route?.name,
      routeFare: bus.route?.fare ? Number(bus.route.fare) : null,
      routePolyline: bus.route?.polyline ?? null,
      driverName: bus.driver?.name,
      driverPhone: bus.driver?.phone ?? null,
      driverUserId: bus.driver?.user?.uniqueId ?? null,
      tripActive: bus.tripActive,
      schoolName: bus.school?.name,
      lat: bus.gpsLat ? Number(bus.gpsLat) : null,
      lng: bus.gpsLng ? Number(bus.gpsLng) : null,
      gpsUpdatedAt: bus.gpsUpdatedAt,
      absentToday: assignment.absentToday ?? false,
      homeLat: student.parentLat ? Number(student.parentLat) : null,
      homeLng: student.parentLng ? Number(student.parentLng) : null,
    });
  }

  async getStudentEta(studentUniqueId: string) {
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { student: { user: { uniqueId: studentUniqueId } } },
      include: { bus: { include: { school: true } }, student: true },
    });
    if (!assignment) throw new NotFoundException('No bus assigned');
    const bus = assignment.bus as any;
    const student = assignment.student as any;

    if (!bus.tripActive) return this.ok(null, 'Trip not active');
    if (!bus.gpsLat || !bus.gpsLng) return this.ok(null, 'Bus location unavailable');

    const busLat = Number(bus.gpsLat), busLng = Number(bus.gpsLng);

    // After pickup → ETA to school; before pickup → ETA to home stop
    if ((assignment as any).pickedUp) {
      // Try AttendanceLocation first, then geocode school address as fallback
      const schoolLocation = await this.prisma.attendanceLocation.findFirst({
        where: { schoolId: bus.schoolId, isActive: true },
        select: { latitude: true, longitude: true },
      });
      if (schoolLocation) {
        return this.calcEta(busLat, busLng, schoolLocation.latitude, schoolLocation.longitude, 'school');
      }
      // Fallback: geocode school address
      const school = await this.prisma.school.findUnique({ where: { id: bus.schoolId }, select: { address: true, city: true, state: true } });
      const addressStr = [school?.address, school?.city, school?.state].filter(Boolean).join(', ');
      if (addressStr) {
        const coords = await this.geocodeAddress(addressStr);
        if (coords) return this.calcEta(busLat, busLng, coords.lat, coords.lng, 'school');
      }
      return this.ok(null, 'School location not configured');
    }

    // Auto-geocode homeAddress → parentLat/parentLng if not already done
    if ((!student.parentLat || !student.parentLng) && student.homeAddress) {
      const coords = await this.geocodeAddress(student.homeAddress);
      if (coords) {
        await this.prisma.student.update({ where: { id: student.id }, data: { parentLat: coords.lat, parentLng: coords.lng } });
        student.parentLat = coords.lat; student.parentLng = coords.lng;
      }
    }
    if (!student.parentLat || !student.parentLng) return this.ok(null, 'Home location not set — please add a home address in your profile');

    return this.calcEta(busLat, busLng, Number(student.parentLat), Number(student.parentLng), 'home');
  }

  private async calcEta(busLat: number, busLng: number, destLat: number, destLng: number, dest: 'home' | 'school') {
    const distMeters = haversineMeters(busLat, busLng, destLat, destLng);
    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${busLng},${busLat};${destLng},${destLat}?overview=false`;
      const { data } = await require('axios').get(url, { timeout: 5000 });
      const route = data?.routes?.[0];
      if (route) return this.ok({ durationSeconds: Math.round(route.duration), distanceMeters: Math.round(route.distance), dest, source: 'osrm' });
    } catch { /* fall through */ }
    const estimatedSeconds = Math.round((distMeters / 1000 / 30) * 3600);
    return this.ok({ durationSeconds: estimatedSeconds, distanceMeters: Math.round(distMeters), dest, source: 'estimate' });
  }

  async getAnalytics(user: any) {
    const schoolId = this.sid(user);
    const where = schoolId ? { schoolId } : {};
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [buses, totalAssigned, activeTrips] = await Promise.all([
      this.prisma.transportBus.findMany({ where, include: { assignments: { select: { id: true, absentToday: true, student: { include: { user: { select: { firstName: true, lastName: true } } } } } }, driver: { select: { name: true } }, route: { select: { name: true } } } }),
      this.prisma.transportAssignment.count({ where: { bus: where } }),
      this.prisma.transportBus.count({ where: { ...where, tripActive: true } }),
    ]);

    const fillRates = buses.map(b => ({
      id: b.id.toString(),
      plateNumber: b.plateNumber,
      route: (b.route as any)?.name ?? 'No route',
      driver: (b.driver as any)?.name ?? 'No driver',
      assigned: b.assignments.length,
      capacity: b.capacity,
      fillRate: Math.round((b.assignments.length / b.capacity) * 100),
    }));

    // Top absent students this session
    const absentCounts = await this.prisma.transportAssignment.findMany({
      where: { absentToday: true, bus: where },
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      take: 5,
    });

    return this.ok({
      totalBuses: buses.length,
      totalAssigned,
      activeTrips,
      fillRates,
      absentToday: absentCounts.map(a => ({
        name: `${(a.student as any).user.firstName} ${(a.student as any).user.lastName}`,
      })),
    });
  }

  async getStaffTransportOverview(user: any) {
    const schoolId = this.sid(user);
    const where = schoolId ? { schoolId } : {};
    const buses = await this.prisma.transportBus.findMany({
      where,
      include: {
        route: { select: { name: true } },
        driver: { select: { name: true, phone: true } },
        assignments: { select: { id: true, absentToday: true, student: { include: { user: { select: { firstName: true, lastName: true, uniqueId: true } } } } } },
      },
      orderBy: { plateNumber: 'asc' },
    });
    return this.ok(buses.map(b => ({
      id: b.id.toString(),
      plateNumber: b.plateNumber,
      capacity: b.capacity,
      tripActive: b.tripActive,
      route: (b.route as any)?.name ?? null,
      driver: (b.driver as any)?.name ?? null,
      driverPhone: (b.driver as any)?.phone ?? null,
      assigned: b.assignments.length,
      absentCount: b.assignments.filter((a: any) => a.absentToday).length,
      students: b.assignments.map((a: any) => ({
        uniqueId: a.student.user.uniqueId,
        name: `${a.student.user.firstName} ${a.student.user.lastName}`,
        absentToday: a.absentToday,
      })),
    })));
  }

  async getDriverDashboard(uniqueId: string) {
    const driver = await this.prisma.transportDriver.findFirst({
      where: { user: { uniqueId } },
      include: {
        buses: {
          include: {
            route: { select: { name: true } },
            assignments: {
              select: {
                id: true, absentToday: true, pickedUp: true, pickedUpAt: true,
                student: { select: { user: { select: { uniqueId: true, firstName: true, lastName: true } } } },
              },
            },
          },
        },
      },
    });
    if (!driver) return this.ok(null);
    const buses = driver.buses as any[];
    const allStudents = buses.flatMap(b => b.assignments);
    const tripDates = buses
      .filter(b => b.tripDate)
      .map(b => ({ date: b.tripDate, plateNumber: b.plateNumber, routeName: b.route?.name ?? null, studentCount: b.assignments.length }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
    return this.ok({
      driverName: driver.name,
      totalBuses: buses.length,
      totalStudents: allStudents.length,
      presentToday: allStudents.filter((a: any) => !a.absentToday).length,
      absentToday: allStudents.filter((a: any) => a.absentToday).length,
      pickedUpToday: allStudents.filter((a: any) => a.pickedUp).length,
      buses: buses.map(b => ({
        id: String(b.id),
        plateNumber: b.plateNumber,
        capacity: b.capacity,
        tripActive: b.tripActive,
        routeName: b.route?.name ?? null,
        driverToken: b.driverToken,
        gpsLat: b.gpsLat ? Number(b.gpsLat) : null,
        gpsLng: b.gpsLng ? Number(b.gpsLng) : null,
        students: b.assignments.map((a: any) => ({
          uniqueId: a.student.user.uniqueId,
          name: `${a.student.user.firstName} ${a.student.user.lastName}`,
          absentToday: a.absentToday,
          pickedUp: a.pickedUp,
          pickedUpAt: a.pickedUpAt,
        })),
      })),
      tripHistory: tripDates,
    });
  }

  async getStudentTripHistory(studentUniqueId: string) {
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { student: { user: { uniqueId: studentUniqueId } } },
      include: { bus: { include: { route: true } } },
    });
    if (!assignment) return this.ok([]);
    const bus = assignment.bus as any;
    const trips = [];
    if (bus.tripDate) trips.push({ date: bus.tripDate, routeName: bus.route?.name, plateNumber: bus.plateNumber });
    return this.ok(trips);
  }

  async getStudentBusCapacity(studentUniqueId: string) {
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { student: { user: { uniqueId: studentUniqueId } } },
      include: { bus: { include: { assignments: { select: { id: true } } } } },
    });
    if (!assignment) throw new NotFoundException('No bus assigned');
    const bus = assignment.bus as any;
    return this.ok({ capacity: bus.capacity, assigned: bus.assignments.length });
  }

  async geocodeStudentAddress(address: string) {
    const coords = await this.geocodeAddress(address);
    if (!coords) throw new BadRequestException('Address could not be geocoded');
    return this.ok(coords);
  }

  async sendSosAlert(studentUniqueId: string, lat: number, lng: number) {
    const student = await this.prisma.student.findFirst({
      where: { user: { uniqueId: studentUniqueId } },
      include: { user: true, classRoom: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { studentId: student.id },
      include: { bus: { include: { driver: true } } },
    });
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const body = `🆘 SOS from ${student.user.firstName} ${student.user.lastName} on the school bus.\nLocation: ${mapsUrl}`;
    // Notify admin via internal message (send from student to school admin)
    const admin = await this.prisma.user.findFirst({ where: { schoolId: student.user.schoolId ?? undefined, role: 'ADMIN' } });
    if (admin) {
      await this.prisma.message.create({ data: { senderId: student.user.id, receiverId: admin.id, body } });
    }
    // Email driver if they have a linked user
    const driverUser = assignment?.bus ? await this.prisma.user.findFirst({ where: { transportDriver: { buses: { some: { id: (assignment.bus as any).id } } } } }) : null;
    if (driverUser?.email) {
      await this.email.sendGeneric({ to: driverUser.email, subject: '🆘 SOS Alert', text: body });
    }
    return this.ok(null, 'SOS alert sent');
  }

  async markStudentAbsent(studentUniqueId: string, absent: boolean) {
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { student: { user: { uniqueId: studentUniqueId } } },
    });
    if (!assignment) throw new NotFoundException('No bus assigned');
    await this.prisma.transportAssignment.update({
      where: { id: assignment.id },
      data: { absentToday: absent },
    });
    return this.ok(null, absent ? 'Marked as absent — driver will skip your stop' : 'Absence cancelled');
  }

  async setStudentHomeCoords(studentUniqueId: string, lat: number, lng: number) {
    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: studentUniqueId } } });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.student.update({ where: { id: student.id }, data: { parentLat: lat, parentLng: lng } });
    return this.ok(null, 'Home location saved');
  }

  // ── Student assignments ───────────────────────────────────────────────────

  private async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const { data } = await require('axios').get(url, { headers: { 'User-Agent': 'Florieren-School/1.0' } });
      if (!data[0]) return null;
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { return null; }
  }

  async assignStudent(busId: string, studentUniqueId: string, user: any) {
    const schoolId = this.sid(user);
    const bus = await this.prisma.transportBus.findUnique({ where: { id: BigInt(busId) }, include: { assignments: true } });
    if (!bus) throw new NotFoundException('Bus not found');
    if (bus.assignments.length >= bus.capacity) throw new BadRequestException('Bus is full');
    const student = await this.prisma.student.findFirst({
      where: { user: { uniqueId: studentUniqueId, ...(schoolId ? { schoolId } : {}) } },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    // Geocode home address if not already done
    if (!student.parentLat && student.homeAddress) {
      const coords = await this.geocodeAddress(student.homeAddress);
      if (coords) {
        await this.prisma.student.update({
          where: { id: student.id },
          data: { parentLat: coords.lat, parentLng: coords.lng },
        });
      }
    }

    await this.prisma.transportAssignment.upsert({
      where: { studentId: student.id },
      update: { busId: BigInt(busId) },
      create: { busId: BigInt(busId), studentId: student.id },
    });
    return this.ok(null, 'Student assigned');
  }

  async unassignStudent(studentUniqueId: string, user: any) {
    const schoolId = this.sid(user);
    const student = await this.prisma.student.findFirst({
      where: { user: { uniqueId: studentUniqueId, ...(schoolId ? { schoolId } : {}) } },
    });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.transportAssignment.deleteMany({ where: { studentId: student.id } });
    return this.ok(null, 'Student unassigned');
  }
}
