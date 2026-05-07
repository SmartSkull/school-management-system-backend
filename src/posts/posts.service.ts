import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private userId(user: any): string {
    return String(user.student_id ?? user.unique_id ?? '');
  }

  async index(q: any, user: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const posts: any[] = await this.prisma.post.findMany({ orderBy: { post_id: 'desc' }, take: perPage, skip: (page - 1) * perPage });
    const uid = this.userId(user);
    for (const post of posts) {
      const liked = await this.prisma.likes.findFirst({ where: { post_id: String(post.post_id), unique_id: uid }, select: { likes_id: true } });
      post.has_liked = !!liked;
    }
    const total = await this.prisma.post.count();
    return { success: true, data: posts, meta: { total, page, per_page: perPage } };
  }

  async show(id: number, user: any) {
    const post = await this.prisma.post.findFirst({ where: { post_id: id } }) as any;
    if (!post) throw new NotFoundException('Post not found');
    post.comments = await this.prisma.comment.findMany({ where: { post_id: id }, orderBy: { comment_id: 'asc' } });
    const liked = await this.prisma.likes.findFirst({ where: { post_id: String(id), unique_id: this.userId(user) }, select: { likes_id: true } });
    post.has_liked = !!liked;
    return this.ok(post);
  }

  async store(user: any, body: any, file?: Express.Multer.File) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can create posts');
    const data: any = { text: body.text, admin_id: user.unique_id, user: 'admin', time: String(new Date()), updated: '' };
    if (file) data.image = file.filename;
    const post = await this.prisma.post.create({ data });
    return this.ok({ id: post.post_id }, 'Post created successfully');
  }

  async update(user: any, id: number, body: any, file?: Express.Multer.File) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can update posts');
    const data: any = { text: body.text, user: body.user || 'both' };
    if (file) data.image = file.filename;
    await this.prisma.post.updateMany({ where: { post_id: id }, data });
    return this.ok(null, 'Post updated successfully');
  }

  async delete(user: any, id: number) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can delete posts');
    await this.prisma.post.deleteMany({ where: { post_id: id } });
    return this.ok(null, 'Post deleted successfully');
  }

  async like(postId: number, user: any) {
    const uid = this.userId(user);
    const where = { post_id: String(postId), unique_id: uid };
    const existing = await this.prisma.likes.findFirst({ where, select: { likes_id: true } });
    if (existing) {
      await this.prisma.likes.deleteMany({ where });
      return this.ok({ liked: false }, 'Post unliked');
    }
    await this.prisma.likes.create({ data: { post_id: String(postId), unique_id: uid, date: String(new Date()) } });
    return this.ok({ liked: true }, 'Post liked');
  }

  async comment(postId: number, user: any, comment: string) {
    if (!comment) throw new BadRequestException('Comment is required');
    const created = await this.prisma.comment.create({ data: { post_id: postId, comment, unique_id: this.userId(user), date: String(new Date()) } });
    return this.ok({ id: created.comment_id }, 'Comment added');
  }
}
