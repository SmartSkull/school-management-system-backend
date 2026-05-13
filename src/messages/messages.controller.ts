import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private svc: MessagesService) {}

  @Get(':role/messages')
  getConversations(@CurrentUser() user: any) { return this.svc.getConversations(user); }

  @Get(':role/messages/unread/count')
  getUnreadCount(@CurrentUser() user: any) { return this.svc.getUnreadCount(user); }

  // Use query param ?with= to avoid slash issues in uniqueId path segments
  @Get(':role/messages/thread')
  getMessages(@CurrentUser() user: any, @Query('uid') otherId: string) { return this.svc.getMessages(user, otherId); }

  @Post(':role/messages')
  sendMessage(@CurrentUser() user: any, @Body() body: any) { return this.svc.sendMessage(user, body); }

  @Put(':role/messages/:id')
  editMessage(@CurrentUser() user: any, @Param('id') id: string, @Body('message') message: string) {
    return this.svc.editMessage(user, id, message);
  }

  @Delete(':role/messages/:id')
  deleteMessage(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.deleteMessage(user, id);
  }

  @Delete(':role/messages/thread')
  deleteConversation(@CurrentUser() user: any, @Query('uid') otherId: string) { return this.svc.deleteConversation(user, otherId); }

  @Post(':role/messages/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadAttachment(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadAttachment(file);
  }

  @Get(':role/users')
  getUsers(@CurrentUser() user: any, @Query('search') search: string, @Query('role') role: string, @Query('class') cls: string) {
    return this.svc.getUsers(search, role, cls);
  }
}
