import { Controller, Get, Query } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller()
export class PublicController {
  constructor(private db: DatabaseService) {}

  @Get('health')
  health() {
    return { success: true, data: { status: 'ok', timestamp: new Date().toISOString() } };
  }

  @Get('public/current-period')
  async currentPeriod() {
    const session = await this.db.queryOne<any>('SELECT set_session FROM session WHERE current_session = 1 LIMIT 1');
    const term = await this.db.queryOne<any>('SELECT term FROM term WHERE current_term = 1 LIMIT 1');
    return { success: true, data: { session: session?.set_session, term: term?.term } };
  }

  @Get('public/sessions')
  async sessions() {
    return { success: true, data: await this.db.query('SELECT * FROM session ORDER BY id DESC') };
  }

  @Get('public/terms')
  async terms() {
    return { success: true, data: await this.db.query('SELECT * FROM term') };
  }

  @Get('public/classes')
  async classes() {
    return { success: true, data: await this.db.query('SELECT * FROM classes ORDER BY id ASC') };
  }

  @Get('public/courses')
  async courses() {
    return { success: true, data: await this.db.query('SELECT * FROM courses ORDER BY id ASC') };
  }

  @Get('public/posts')
  async posts() {
    return { success: true, data: await this.db.query('SELECT * FROM posts ORDER BY post_id DESC LIMIT 20') };
  }

  @Get('public/students/search')
  async searchStudents(@Query('q') q: string) {
    if (!q) return { success: true, data: [] };
    const like = `%${q}%`;
    return { success: true, data: await this.db.query('SELECT student_id, firstname, lastname, class FROM users WHERE firstname LIKE ? OR lastname LIKE ?', [like, like]) };
  }
}
