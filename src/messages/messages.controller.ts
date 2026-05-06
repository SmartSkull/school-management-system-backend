import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
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

  @Get(':role/messages/:user_id')
  getMessages(@CurrentUser() user: any, @Param('user_id') otherId: string) { return this.svc.getMessages(user, otherId); }

  @Post(':role/messages')
  sendMessage(@CurrentUser() user: any, @Body() body: any) { return this.svc.sendMessage(user, body); }

  @Delete(':role/messages/:user_id')
  deleteConversation(@CurrentUser() user: any, @Param('user_id') otherId: string) { return this.svc.deleteConversation(user, otherId); }

  @Post(':role/messages/upload')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: './uploads/messages', filename: (_, f, cb) => cb(null, `${Date.now()}${extname(f.originalname)}`) }) }))
  uploadAttachment(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadAttachment(file);
  }

  @Get(':role/users')
  getUsers(@CurrentUser() user: any, @Query('search') search: string) { return this.svc.getUsers(search); }
}
