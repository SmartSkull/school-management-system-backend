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
    const session = await this.prisma.set_session_tbl.findFirst();
    const term = await this.prisma.set_term_tbl.findFirst();
    return { success: true, data: { session: session?.set_session, term: term?.set_term } };
  }

  @Get('public/sessions')
  async sessions() {
    return { success: true, data: await this.prisma.session.findMany({ orderBy: { session: 'desc' } }) };
  }

  @Get('public/terms')
  async terms() {
    return { success: true, data: await this.prisma.term.findMany({ orderBy: { term_id: 'asc' } }) };
  }

  @Get('public/classes')
  async classes() {
    return { success: true, data: await this.prisma.renamedclass.findMany({ orderBy: { class_id: 'asc' } }) };
  }

  @Get('public/courses')
  async courses() {
    const courses = await this.prisma.course.findMany({ orderBy: { courses: 'asc' } });
    return { success: true, data: courses.map(c => ({ course_id: c.course_id, course: c.courses, teacher: c.teacher })) };
  }

  @Get('public/posts')
  async posts() {
    return { success: true, data: await this.prisma.post.findMany({ orderBy: { post_id: 'desc' }, take: 20 }) };
  }

  @Get('public/students/search')
  async searchStudents(@Query('q') q: string) {
    if (!q) return { success: true, data: [] };
    return { success: true, data: await this.prisma.users.findMany({
      where: { OR: [{ firstname: { contains: q } }, { lastname: { contains: q } }] },
      select: { student_id: true, firstname: true, lastname: true, class: true },
    }) };
  }
}
