import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../common/email.service';
import * as crypto from 'crypto';

const PROXIMITY_METERS = 500;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class TransportService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

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
        driver: { select: { id: true, name: true } },
        assignments: {
          select: {
            id: true,
            student: { select: { user: { select: { uniqueId: true, firstName: true, lastName: true } } } },
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
    await this.prisma.transportAssignment.updateMany({ where: { busId: BigInt(id) }, data: { alertedAt: null } });
    await this.prisma.transportBus.update({ where: { id: BigInt(id) }, data: { tripActive: true, tripDate: today } });
    return this.ok(null, 'Trip started');
  }

  async endTrip(id: string) {
    await this.prisma.transportBus.update({ where: { id: BigInt(id) }, data: { tripActive: false } });
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
          where: { alertedAt: null },
          include: { student: { include: { user: true } } },
        },
      },
    });
    if (!bus?.tripActive) return;

    for (const a of bus.assignments) {
      const s = a.student;
      if (!s.parentLat || !s.parentLng) continue;
      const alertEmail = s.user.email; // use student/parent contact email
      if (!alertEmail) continue;
      const dist = haversineMeters(lat, lng, Number(s.parentLat), Number(s.parentLng));
      if (dist <= PROXIMITY_METERS) {
        await this.prisma.transportAssignment.update({ where: { id: a.id }, data: { alertedAt: new Date() } });
        await this.email.sendBusProximityAlert({
          parentEmail: alertEmail,
          studentName: `${s.user.firstName} ${s.user.lastName}`,
          plateNumber: bus.plateNumber,
          routeName: (bus.route as any)?.name,
          distanceMeters: Math.round(dist),
          schoolName: (bus.school as any)?.name ?? 'School',
        });
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
      include: {
        bus: true,
        student: true,
      },
    });
    if (!assignment) throw new NotFoundException('No bus assigned');
    const bus = assignment.bus as any;
    const student = assignment.student as any;

    if (!bus.tripActive) return this.ok(null, 'Trip not active');
    if (!bus.gpsLat || !bus.gpsLng) return this.ok(null, 'Bus location unavailable');

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

    if (!student.parentLat || !student.parentLng) return this.ok(null, 'Home location not set — please add a home address in your profile');

    const busLat = Number(bus.gpsLat), busLng = Number(bus.gpsLng);
    const homeLat = Number(student.parentLat), homeLng = Number(student.parentLng);

    // Straight-line distance fallback
    const distMeters = haversineMeters(busLat, busLng, homeLat, homeLng);

    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${busLng},${busLat};${homeLng},${homeLat}?overview=false`;
      const { data } = await require('axios').get(url, { timeout: 5000 });
      const route = data?.routes?.[0];
      if (route) {
        return this.ok({
          durationSeconds: Math.round(route.duration),
          distanceMeters: Math.round(route.distance),
          source: 'osrm',
        });
      }
    } catch { /* fall through to haversine estimate */ }

    // Rough estimate: assume 30 km/h average in urban area
    const estimatedSeconds = Math.round((distMeters / 1000 / 30) * 3600);
    return this.ok({ durationSeconds: estimatedSeconds, distanceMeters: Math.round(distMeters), source: 'estimate' });
  }

  async getStudentTripHistory(studentUniqueId: string) {
    const assignment = await this.prisma.transportAssignment.findFirst({
      where: { student: { user: { uniqueId: studentUniqueId } } },
      include: { bus: { include: { route: true } } },
    });
    if (!assignment) return this.ok([]);
    // Return last 30 trip dates for this bus
    const bus = assignment.bus as any;
    // We only store tripDate (latest), so return what we have plus createdAt history via assignments
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
