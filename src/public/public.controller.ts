import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Controller()
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get('health')
  health() {
    return { success: true, data: { status: 'ok', timestamp: new Date().toISOString() } };
  }

  @Get('public/current-period')
  async currentPeriod() {
    const session = await this.prisma.academicSession.findFirst({ where: { isCurrent: true } });
    const term = await this.prisma.academicTerm.findFirst({ where: { isCurrent: true } });
    return { success: true, data: { session: session?.name, term: term?.name } };
  }

  @Get('public/sessions')
  async sessions() {
    return { success: true, data: await this.prisma.academicSession.findMany({ orderBy: { name: 'desc' } }) };
  }

  @Get('public/terms')
  async terms() {
    return { success: true, data: await this.prisma.academicTerm.findMany({ orderBy: { id: 'asc' } }) };
  }

  @Get('public/classes')
  async classes() {
    return { success: true, data: await this.prisma.classRoom.findMany({ orderBy: { name: 'asc' } }) };
  }

  @Get('public/courses')
  async courses() {
    const courses = await this.prisma.subject.findMany({ orderBy: { name: 'asc' } });
    return { success: true, data: courses.map(c => ({ course_id: c.id.toString(), course: c.name })) };
  }

  @Get('public/posts')
  async posts() {
    const posts = await this.prisma.post.findMany({ 
      orderBy: { createdAt: 'desc' }, 
      take: 20,
      include: { author: { select: { firstName: true, lastName: true } } }
    });
    return { success: true, data: posts.map(p => ({ ...p, id: p.id.toString(), author_name: `${p.author.firstName} ${p.author.lastName}` })) };
  }

  @Get('public/approved-results-meta')
  async approvedResultsMeta() {
    const [sessionTermRows, classRooms] = await Promise.all([
      this.prisma.result.findMany({
        where: { approvedAt: { not: null } },
        select: {
          session: { select: { name: true } },
          term: { select: { name: true } },
        },
        distinct: ['sessionId', 'termId'],
      }),
      this.prisma.classRoom.findMany({
        where: {
          students: {
            some: { results: { some: { approvedAt: { not: null } } } }
          }
        },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { success: true, data: {
      sessions: [...new Set(sessionTermRows.map(r => r.session.name))],
      terms: [...new Set(sessionTermRows.map(r => r.term.name))],
      classes: classRooms.map(c => c.name),
    }};
  }


  @Get('public/students/search')
  async searchStudents(@Query('q') q: string) {
    if (!q) return { success: true, data: [] };
    const users = await this.prisma.user.findMany({
      where: { 
        role: 'STUDENT',
        OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] 
      },
      select: { uniqueId: true, firstName: true, lastName: true, student: { select: { classRoom: { select: { name: true } } } } },
    });
    return { success: true, data: users.map(u => ({
      student_id: u.uniqueId,
      firstname: u.firstName,
      lastname: u.lastName,
      class: u.student?.classRoom?.name
    })) };
  }
}
