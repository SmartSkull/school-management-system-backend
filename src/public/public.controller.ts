import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaService } from '../database/prisma.service';
import { uploadToCloudinary } from '../common/cloudinary';
import { EmailService } from '../common/email.service';
import OpenAI from 'openai';

@Controller()
export class PublicController {
  constructor(private prisma: PrismaService, private emailService: EmailService) {}

  private schoolSelect = {
    id: true,
    name: true,
    slug: true,
    slogan: true,
    motto: true,
    description: true,
    email: true,
    contactEmail: true,
    contactName: true,
    telephone: true,
    alternatePhone: true,
    address: true,
    city: true,
    state: true,
    country: true,
    website: true,
    logo: true,
    primaryColor: true,
    secondaryColor: true,
    accentColor: true,
    status: true,
  } as const;

  private serializeSchool(school: any) {
    return {
      ...school,
      id: school.id?.toString(),
      location: [school.address, school.city, school.state, school.country].filter(Boolean).join(', '),
      contact: {
        name: school.contactName,
        email: school.contactEmail || school.email,
        phone: school.telephone,
        alternatePhone: school.alternatePhone,
      },
      colors: {
        primary: school.primaryColor,
        secondary: school.secondaryColor,
        accent: school.accentColor,
      },
    };
  }

  private makeSlug(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }

  private normalizeOptional(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  @Get('health')
  health() {
    return { success: true, data: { status: 'ok', timestamp: new Date().toISOString() } };
  }

  @Get('public/current-period')
  async currentPeriod(@Query('school') school?: string) {
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;
    const schoolId = selectedSchool?.id;
    const where: any = schoolId ? { schoolId } : {};
    const session = await this.prisma.academicSession.findFirst({ where: { ...where, isCurrent: true } })
      ?? await this.prisma.academicSession.findFirst({ where, orderBy: { createdAt: 'desc' } });
    const term = await this.prisma.academicTerm.findFirst({ where: { ...where, isCurrent: true } })
      ?? await this.prisma.academicTerm.findFirst({ where, orderBy: { createdAt: 'desc' } });
    return { success: true, data: { session: session?.name, term: term?.name } };
  }

  @Get('public/sessions')
  async sessions(@Query('school') school?: string) {
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;
    return {
      success: true,
      data: await this.prisma.academicSession.findMany({
        where: selectedSchool ? { schoolId: selectedSchool.id } : {},
        orderBy: { name: 'desc' },
      }),
    };
  }

  @Get('public/terms')
  async terms() {
    return { success: true, data: await this.prisma.academicTerm.findMany({ orderBy: { id: 'asc' } }) };
  }

  @Get('public/classes')
  async classes(@Query('school') school?: string) {
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;
    return {
      success: true,
      data: await this.prisma.classRoom.findMany({
        where: selectedSchool ? { schoolId: selectedSchool.id } : {},
        orderBy: { name: 'asc' },
      }),
    };
  }

  @Get('public/schools')
  async schools(@Query('q') q?: string) {
    const search = q?.trim();
    const schools = await this.prisma.school.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { slug: { contains: search } },
            { city: { contains: search } },
            { state: { contains: search } },
            { address: { contains: search } },
          ],
        } : {}),
      },
      select: this.schoolSelect,
      orderBy: { name: 'asc' },
      take: 20,
    });

    return { success: true, data: schools.map(s => this.serializeSchool(s)) };
  }

  @Get('public/schools/check')
  async checkSchool(
    @Query('slug') slug?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
  ) {
    const normalizedSlug = slug ? this.makeSlug(slug) : undefined;
    const normalizedName = this.normalizeOptional(name);
    const normalizedEmail = this.normalizeOptional(email);

    if (!normalizedSlug && !normalizedName && !normalizedEmail) {
      throw new BadRequestException('Provide slug, name, or email to check');
    }

    const school = await this.prisma.school.findFirst({
      where: {
        OR: [
          ...(normalizedSlug ? [{ slug: normalizedSlug }] : []),
          ...(normalizedName ? [{ name: normalizedName }] : []),
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
      select: this.schoolSelect,
    });

    return {
      success: true,
      data: {
        exists: !!school,
        available: !school,
        slug: normalizedSlug,
        school: school ? this.serializeSchool(school) : null,
      },
    };
  }

  @Post('public/schools/register')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async registerSchool(@Body() body: any, @UploadedFile() logo: Express.Multer.File) {
    const name = this.normalizeOptional(body?.name);
    const slug = this.makeSlug(this.normalizeOptional(body?.slug) || name || '');
    const email = this.normalizeOptional(body?.email);

    if (!name) throw new BadRequestException('School name is required');
    if (!slug) throw new BadRequestException('A valid school slug is required');
    if (!logo) throw new BadRequestException('School logo is required');
    if (!logo.mimetype?.startsWith('image/')) throw new BadRequestException('School logo must be an image');

    const existing = await this.prisma.school.findFirst({
      where: {
        OR: [
          { slug },
          { name },
          ...(email ? [{ email }] : []),
        ],
      },
      select: { id: true, slug: true, name: true, email: true },
    });

    if (existing) {
      throw new ConflictException('School already exists');
    }

    const logoUrl = await uploadToCloudinary(logo, 'florieren/schools');

    const school = await this.prisma.school.create({
      data: {
        name,
        slug,
        email,
        slogan: this.normalizeOptional(body?.slogan),
        motto: this.normalizeOptional(body?.motto),
        description: this.normalizeOptional(body?.description),
        contactEmail: this.normalizeOptional(body?.contactEmail),
        contactName: this.normalizeOptional(body?.contactName),
        telephone: this.normalizeOptional(body?.telephone),
        alternatePhone: this.normalizeOptional(body?.alternatePhone),
        address: this.normalizeOptional(body?.address),
        city: this.normalizeOptional(body?.city),
        state: this.normalizeOptional(body?.state),
        country: this.normalizeOptional(body?.country) || 'Nigeria',
        website: this.normalizeOptional(body?.website),
        logo: logoUrl,
        primaryColor: this.normalizeOptional(body?.primaryColor) || '#1a73e8',
        secondaryColor: this.normalizeOptional(body?.secondaryColor) || '#ffffff',
        accentColor: this.normalizeOptional(body?.accentColor) || '#84cc16',
        status: 'PENDING',
      },
      select: this.schoolSelect,
    });

    this.emailService.sendSchoolRegistered({
      name: school.name,
      email: school.email ?? undefined,
      slug: school.slug,
      slogan: (school as any).slogan ?? undefined,
      address: (school as any).address ?? undefined,
      city: (school as any).city ?? undefined,
      state: (school as any).state ?? undefined,
      country: (school as any).country ?? undefined,
      telephone: (school as any).telephone ?? undefined,
      website: (school as any).website ?? undefined,
      logo: (school as any).logo ?? undefined,
      primaryColor: (school as any).primaryColor ?? undefined,
    });

    return {
      success: true,
      data: this.serializeSchool(school),
      message: 'School registration submitted and is pending approval',
    };
  }

  @Get('public/schools/:slug')
  async school(@Param('slug') slug: string) {
    const school = await this.prisma.school.findUnique({
      where: { slug },
      select: this.schoolSelect,
    });

    if (!school) throw new NotFoundException('School not found');
    return { success: true, data: this.serializeSchool(school) };
  }

  @Get('public/courses')
  async courses(@Query('school') school?: string) {
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;
    const courses = await this.prisma.subject.findMany({
      where: selectedSchool ? { classRoom: { schoolId: selectedSchool.id } } : {},
      orderBy: { name: 'asc' },
    });
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
  async approvedResultsMeta(@Query('school') school?: string) {
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;
    const schoolId = selectedSchool?.id;
    const [sessionTermRows, classRooms] = await Promise.all([
      this.prisma.result.findMany({
        where: {
          approvedAt: { not: null },
          ...(schoolId ? { session: { schoolId } } : {}),
        },
        select: {
          session: { select: { name: true } },
          term: { select: { name: true } },
        },
        distinct: ['sessionId', 'termId'],
      }),
      this.prisma.classRoom.findMany({
        where: {
          schoolId,
          students: {
            some: { results: { some: { approvedAt: { not: null }, session: { schoolId } } } }
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
  async searchStudents(@Query('q') q: string, @Query('school') school?: string) {
    if (!q) return { success: true, data: [] };
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;

    const users = await this.prisma.user.findMany({
      where: { 
        role: 'STUDENT',
        ...(selectedSchool ? { schoolId: selectedSchool.id } : {}),
        OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] 
      },
      select: { uniqueId: true, firstName: true, lastName: true, image: true, student: { select: { classRoom: { select: { name: true } } } } },
    });
    return { success: true, data: users.map(u => ({
      student_id: u.uniqueId,
      firstname: u.firstName,
      lastname: u.lastName,
      image: u.image ?? null,
      class: u.student?.classRoom?.name
    })) };
  }

  @Get('public/staff/search')
  async searchStaff(@Query('q') q: string, @Query('school') school?: string) {
    if (!q) return { success: true, data: [] };
    const selectedSchool = school
      ? await this.prisma.school.findUnique({ where: { slug: school }, select: { id: true } })
      : null;

    const users = await this.prisma.user.findMany({
      where: {
        role: 'STAFF',
        ...(selectedSchool ? { schoolId: selectedSchool.id } : {}),
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { uniqueId: { contains: q } },
        ],
      },
      select: {
        uniqueId: true,
        firstName: true,
        lastName: true,
        image: true,
        staff: { select: { staffRole: true } },
      },
      take: 8,
    });
    return {
      success: true,
      data: users.map(u => ({
        staff_id: u.uniqueId,
        firstname: u.firstName,
        lastname: u.lastName,
        image: u.image ?? null,
        role: u.staff?.staffRole ?? null,
      })),
    };
  }
}
