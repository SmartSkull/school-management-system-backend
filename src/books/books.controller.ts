import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { BooksService } from './books.service';
import { AdminGuard } from '../common/guards/auth.guard';

@Controller('admin/books')
@UseGuards(AdminGuard)
export class BooksController {
  constructor(private service: BooksService) {}

  @Get() getBooks(@Request() req: any, @Query() q: any) { return this.service.getBooks(req.user, q); }
  @Get('barcode/:barcode') getByBarcode(@Param('barcode') barcode: string, @Request() req: any) { return this.service.getBookByBarcode(barcode, req.user); }
  @Post() createBook(@Request() req: any, @Body() body: any) { return this.service.createBook(req.user, body); }
  @Put(':id') updateBook(@Param('id') id: string, @Body() body: any) { return this.service.updateBook(id, body); }
  @Delete(':id') deleteBook(@Param('id') id: string) { return this.service.deleteBook(id); }

  @Get('borrows') getBorrows(@Request() req: any, @Query() q: any) { return this.service.getBorrows(req.user, q); }
  @Post('borrows') borrowBook(@Request() req: any, @Body() body: any) { return this.service.borrowBook(req.user, body); }
  @Post('borrows/:id/return') returnBook(@Param('id') id: string) { return this.service.returnBook(id); }
  @Post('borrows/:id/fine-paid') markFinePaid(@Param('id') id: string) { return this.service.markFinePaid(id); }
}
