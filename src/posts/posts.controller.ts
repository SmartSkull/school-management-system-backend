import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PostsService } from './posts.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private svc: PostsService) {}

  @Get(':role/posts')
  index(@Query() q: any, @CurrentUser() user: any) { return this.svc.index(q, user); }

  @Get(':role/posts/:id')
  show(@Param('id') id: string, @CurrentUser() user: any) { return this.svc.show(+id, user); }

  @Post('admin/posts')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  store(@CurrentUser() user: any, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.store(user, body, file);
  }

  @Put('admin/posts/:id')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.update(user, +id, body, file);
  }

  @Delete('admin/posts/:id')
  delete(@CurrentUser() user: any, @Param('id') id: string) { return this.svc.delete(user, +id); }

  @Post(':role/posts/:id/like')
  like(@Param('id') id: string, @CurrentUser() user: any) { return this.svc.like(+id, user); }

  @Post(':role/posts/:id/comment')
  comment(@Param('id') id: string, @CurrentUser() user: any, @Body('comment') comment: string) {
    return this.svc.comment(+id, user, comment);
  }

  @Put(':role/posts/:postId/comment/:commentId')
  updateComment(@Param('commentId') commentId: string, @CurrentUser() user: any, @Body('comment') text: string) {
    return this.svc.updateComment(+commentId, user, text);
  }

  @Delete(':role/posts/:postId/comment/:commentId')
  deleteComment(@Param('commentId') commentId: string, @CurrentUser() user: any) {
    return this.svc.deleteComment(+commentId, user);
  }
}
