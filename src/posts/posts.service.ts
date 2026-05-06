import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PostsService {
  constructor(private db: DatabaseService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private userId(user: any): string {
    return String(user.student_id ?? user.unique_id ?? '');
  }

  async index(q: any, user: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    const offset = (page - 1) * perPage;
    const posts = await this.db.query('SELECT * FROM posts ORDER BY post_id DESC LIMIT ? OFFSET ?', [perPage, offset]);
    const uid = this.userId(user);
    for (const post of posts as any[]) {
      const liked = await this.db.queryOne('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [post.post_id, uid]);
      post.has_liked = !!liked;
    }
    const total = await this.db.count('posts');
    return { success: true, data: posts, meta: { total, page, per_page: perPage } };
  }

  async show(id: number, user: any) {
    const post = await this.db.queryOne<any>('SELECT * FROM posts WHERE post_id = ?', [id]);
    if (!post) throw new NotFoundException('Post not found');
    post.comments = await this.db.query('SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC', [id]);
    const liked = await this.db.queryOne('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [id, this.userId(user)]);
    post.has_liked = !!liked;
    return this.ok(post);
  }

  async store(user: any, body: any, file?: Express.Multer.File) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can create posts');
    const data: any = { text: body.text, admin_id: user.unique_id, user: 'admin', date: new Date() };
    if (file) data.image = file.filename;
    const id = await this.db.insert('posts', data);
    return this.ok({ id }, 'Post created successfully');
  }

  async update(user: any, id: number, body: any, file?: Express.Multer.File) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can update posts');
    const data: any = { text: body.text, user: body.user || 'both' };
    if (file) data.image = file.filename;
    await this.db.update('posts', data, 'post_id = ?', [id]);
    return this.ok(null, 'Post updated successfully');
  }

  async delete(user: any, id: number) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can delete posts');
    await this.db.delete('posts', 'post_id = ?', [id]);
    return this.ok(null, 'Post deleted successfully');
  }

  async like(postId: number, user: any) {
    const uid = this.userId(user);
    const existing = await this.db.queryOne('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [postId, uid]);
    if (existing) {
      await this.db.delete('likes', 'post_id = ? AND user_id = ?', [postId, uid]);
      await this.db.update('posts', { likes: await this.db.count('likes', 'post_id = ?', [postId]) }, 'post_id = ?', [postId]);
      return this.ok({ liked: false }, 'Post unliked');
    }
    await this.db.insert('likes', { post_id: postId, user_id: uid });
    await this.db.update('posts', { likes: await this.db.count('likes', 'post_id = ?', [postId]) }, 'post_id = ?', [postId]);
    return this.ok({ liked: true }, 'Post liked');
  }

  async comment(postId: number, user: any, comment: string) {
    if (!comment) throw new BadRequestException('Comment is required');
    const id = await this.db.insert('comments', { post_id: postId, comment, user_id: this.userId(user), date: new Date() });
    return this.ok({ id }, 'Comment added');
  }
}
