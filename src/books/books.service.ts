import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const FINE_PER_DAY = 50; // ₦50/day overdue fine

@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') { return { success: true, data, message }; }
  private schoolId(user: any): bigint | undefined { return user?.schoolId ? BigInt(user.schoolId) : undefined; }

  // ── Catalog ──────────────────────────────────────────────────────────────

  async getBooks(user: any, q: any) {
    const schoolId = this.schoolId(user);
    const where: any = schoolId ? { schoolId } : {};
    if (q.search) where.OR = [{ title: { contains: q.search } }, { author: { contains: q.search } }, { isbn: { contains: q.search } }, { barcode: { contains: q.search } }];
    if (q.category) where.category = q.category;
    const books = await this.prisma.book.findMany({ where, orderBy: { title: 'asc' } });
    return this.ok(books);
  }

  async getBookByBarcode(barcode: string, user: any) {
    const schoolId = this.schoolId(user);
    const book = await this.prisma.book.findFirst({ where: { barcode, ...(schoolId ? { schoolId } : {}) } });
    if (!book) throw new NotFoundException('Book not found');
    return this.ok(book);
  }

  async createBook(user: any, body: { title: string; author: string; isbn?: string; barcode?: string; category?: string; copies?: number }) {
    const schoolId = this.schoolId(user);
    if (body.barcode) {
      const exists = await this.prisma.book.findUnique({ where: { barcode: body.barcode } });
      if (exists) throw new BadRequestException('Barcode already in use');
    }
    const copies = body.copies ?? 1;
    const book = await this.prisma.book.create({
      data: { title: body.title, author: body.author, isbn: body.isbn, barcode: body.barcode, category: body.category, copies, available: copies, ...(schoolId ? { schoolId } : {}) },
    });
    return this.ok(book, 'Book added');
  }

  async updateBook(id: string, body: Partial<{ title: string; author: string; isbn: string; barcode: string; category: string; copies: number }>) {
    const book = await this.prisma.book.findUnique({ where: { id: BigInt(id) } });
    if (!book) throw new NotFoundException('Book not found');
    if (body.copies !== undefined) {
      const diff = body.copies - book.copies;
      body = { ...body } as any;
      (body as any).available = Math.max(0, book.available + diff);
    }
    return this.ok(await this.prisma.book.update({ where: { id: BigInt(id) }, data: body }), 'Book updated');
  }

  async deleteBook(id: string) {
    const book = await this.prisma.book.findUnique({ where: { id: BigInt(id) } });
    if (!book) throw new NotFoundException('Book not found');
    const active = await this.prisma.bookBorrow.count({ where: { bookId: BigInt(id), returnedAt: null } });
    if (active) throw new BadRequestException('Book has active borrows');
    await this.prisma.book.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Book deleted');
  }

  // ── Borrow ────────────────────────────────────────────────────────────────

  async getBorrows(user: any, q: any) {
    const schoolId = this.schoolId(user);
    const where: any = {};
    if (schoolId) where.book = { schoolId };
    if (q.status === 'active') where.returnedAt = null;
    if (q.status === 'returned') where.returnedAt = { not: null };
    if (q.status === 'overdue') { where.returnedAt = null; where.dueDate = { lt: new Date() }; }
    const borrows = await this.prisma.bookBorrow.findMany({
      where,
      include: { book: true, student: { include: { user: true } } },
      orderBy: { borrowedAt: 'desc' },
    });
    // recalculate fines on the fly
    const now = new Date();
    return this.ok(borrows.map(b => {
      const overdueDays = !b.returnedAt && b.dueDate < now ? Math.floor((now.getTime() - b.dueDate.getTime()) / 86400000) : 0;
      const fine = b.finePaid ? Number(b.fine) : overdueDays * FINE_PER_DAY;
      return { ...b, fine, overdueDays };
    }));
  }

  async borrowBook(user: any, body: { bookIdOrBarcode: string; studentUniqueId: string; dueDays?: number }) {
    const schoolId = this.schoolId(user);
    const book = await this.prisma.book.findFirst({
      where: {
        OR: [{ id: isNaN(Number(body.bookIdOrBarcode)) ? undefined : BigInt(body.bookIdOrBarcode) }, { barcode: body.bookIdOrBarcode }].filter(Boolean) as any,
        ...(schoolId ? { schoolId } : {}),
      },
    });
    if (!book) throw new NotFoundException('Book not found');
    if (book.available < 1) throw new BadRequestException('No copies available');

    const student = await this.prisma.student.findFirst({ where: { user: { uniqueId: body.studentUniqueId } } });
    if (!student) throw new NotFoundException('Student not found');

    const active = await this.prisma.bookBorrow.findFirst({ where: { bookId: book.id, studentId: student.id, returnedAt: null } });
    if (active) throw new BadRequestException('Student already has this book');

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (body.dueDays ?? 14));

    await this.prisma.$transaction([
      this.prisma.bookBorrow.create({ data: { bookId: book.id, studentId: student.id, dueDate } }),
      this.prisma.book.update({ where: { id: book.id }, data: { available: { decrement: 1 } } }),
    ]);
    return this.ok(null, 'Book borrowed');
  }

  async returnBook(borrowId: string) {
    const borrow = await this.prisma.bookBorrow.findUnique({ where: { id: BigInt(borrowId) } });
    if (!borrow) throw new NotFoundException('Borrow record not found');
    if (borrow.returnedAt) throw new BadRequestException('Already returned');

    const now = new Date();
    const overdueDays = borrow.dueDate < now ? Math.floor((now.getTime() - borrow.dueDate.getTime()) / 86400000) : 0;
    const fine = overdueDays * FINE_PER_DAY;

    await this.prisma.$transaction([
      this.prisma.bookBorrow.update({ where: { id: BigInt(borrowId) }, data: { returnedAt: now, fine } }),
      this.prisma.book.update({ where: { id: borrow.bookId }, data: { available: { increment: 1 } } }),
    ]);
    return this.ok({ fine, overdueDays }, overdueDays ? `Returned with ₦${fine} fine` : 'Returned successfully');
  }

  async markFinePaid(borrowId: string) {
    const borrow = await this.prisma.bookBorrow.findUnique({ where: { id: BigInt(borrowId) } });
    if (!borrow) throw new NotFoundException('Borrow record not found');
    await this.prisma.bookBorrow.update({ where: { id: BigInt(borrowId) }, data: { finePaid: true } });
    return this.ok(null, 'Fine marked as paid');
  }
}
