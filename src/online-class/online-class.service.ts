import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OnlineClassService {
  constructor(private prisma: PrismaService) {}

  async create(staffUser: any, dto: { title: string; className: string; scheduledAt: string; durationMinutes: number }) {
    const schoolId = BigInt(staffUser.schoolId ?? staffUser.user?.schoolId);
    const staffId = BigInt(staffUser.id ?? staffUser.staffId);
    const roomName = `smartcampus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const roomUrl = `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false&config.disableModeratorIndicator=false&config.startWithAudioMuted=false`;

    return this.prisma.onlineClass.create({
      data: {
        title: dto.title,
        className: dto.className,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes,
        roomName,
        roomUrl,
        schoolId,
        staffId,
      },
    });
  }

  async findAll(schoolId: bigint, className?: string) {
    return this.prisma.onlineClass.findMany({
      where: { schoolId, ...(className ? { className } : {}) },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async delete(id: number) {
    const cls = await this.prisma.onlineClass.findFirst({ where: { id } });
    if (!cls) throw new NotFoundException('Class not found');
    return this.prisma.onlineClass.delete({ where: { id } });
  }
}
