import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    return user?.schoolId ? BigInt(user.schoolId) : undefined;
  }

  private postSchoolWhere(user: any) {
    const schoolId = this.schoolId(user);
    return schoolId ? { author: { schoolId } } : {};
  }

  async index(q: any, user: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    
    const posts = await this.prisma.post.findMany({ 
      where: this.postSchoolWhere(user),
      orderBy: { createdAt: 'desc' }, 
      take: perPage, 
      skip: (page - 1) * perPage,
      include: { 
        author: { select: { firstName: true, lastName: true, image: true, role: true } },
        _count: { select: { likes: true, comments: true } }
      }
    });

    const data = await Promise.all(posts.map(async post => {
      const liked = await this.prisma.like.findUnique({ 
        where: { postId_userId: { postId: post.id, userId: BigInt(user.id) } } 
      });
      return { 
        ...post, 
        id: post.id.toString(),
        post_id: post.id.toString(),
        title: post.text?.split('\n')[0]?.slice(0, 80) || '',
        content: post.text,
        created_at: post.createdAt,
        liked: !!liked,
        likes: post._count.likes,
        comments: post._count.comments,
        author_name: `${post.author.firstName} ${post.author.lastName}`,
        author_image: post.author.image,
      };
    }));

    const total = await this.prisma.post.count({ where: this.postSchoolWhere(user) });
    return { success: true, data, meta: { total, page, per_page: perPage } };
  }

  async show(id: number, user: any) {
    const post = await this.prisma.post.findFirst({ 
      where: { id: BigInt(id), ...this.postSchoolWhere(user) },
      include: { 
        author: { select: { firstName: true, lastName: true, image: true } },
        comments: { 
          include: { author: { select: { firstName: true, lastName: true, image: true } } },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!post) throw new NotFoundException('Post not found');

    const liked = await this.prisma.like.findUnique({ 
      where: { postId_userId: { postId: post.id, userId: BigInt(user.id) } } 
    });

    return this.ok({ 
      ...post, 
      post_id: post.id.toString(),
      has_liked: !!liked,
      author_name: `${post.author.firstName} ${post.author.lastName}`,
    });
  }

  async store(user: any, body: any, file?: Express.Multer.File) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can create posts');
    const post = await this.prisma.post.create({ 
      data: { 
        text: body.text, 
        authorId: BigInt(user.id),
        image: file?.filename 
      } 
    });
    return this.ok({ id: post.id.toString() }, 'Post created successfully');
  }

  async update(user: any, id: number, body: any, file?: Express.Multer.File) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can update posts');
    const data: any = { text: body.text };
    if (file) data.image = file.filename;
    const post = await this.prisma.post.findFirst({ where: { id: BigInt(id), ...this.postSchoolWhere(user) } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.post.update({ where: { id: BigInt(id) }, data });
    return this.ok(null, 'Post updated successfully');
  }

  async delete(user: any, id: number) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can delete posts');
    const post = await this.prisma.post.findFirst({ where: { id: BigInt(id), ...this.postSchoolWhere(user) } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.post.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Post deleted successfully');
  }

  async like(postId: number, user: any) {
    const userId = BigInt(user.id);
    const post_id = BigInt(postId);
    const post = await this.prisma.post.findFirst({ where: { id: post_id, ...this.postSchoolWhere(user) } });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.prisma.like.findUnique({ 
      where: { postId_userId: { postId: post_id, userId } } 
    });
    if (existing) {
      await this.prisma.like.delete({ 
        where: { postId_userId: { postId: post_id, userId } } 
      });
      return this.ok({ liked: false }, 'Post unliked');
    }
    await this.prisma.like.create({ data: { postId: post_id, userId } });
    return this.ok({ liked: true }, 'Post liked');
  }

  async comment(postId: number, user: any, comment: string) {
    if (!comment) throw new BadRequestException('Comment is required');
    const post = await this.prisma.post.findFirst({ where: { id: BigInt(postId), ...this.postSchoolWhere(user) } });
    if (!post) throw new NotFoundException('Post not found');
    const created = await this.prisma.comment.create({ 
      data: { postId: BigInt(postId), text: comment, authorId: BigInt(user.id) } 
    });
    return this.ok({ id: created.id.toString(), text: created.text, author: { firstName: user.firstName, lastName: user.lastName } }, 'Comment added');
  }

  async updateComment(commentId: number, user: any, text: string) {
    if (!text) throw new BadRequestException('Comment text is required');
    const c = await this.prisma.comment.findUnique({ where: { id: BigInt(commentId) } });
    if (!c) throw new NotFoundException('Comment not found');
    if (c.authorId !== BigInt(user.id)) throw new ForbiddenException('Not your comment');
    await this.prisma.comment.update({ where: { id: BigInt(commentId) }, data: { text } });
    return this.ok(null, 'Comment updated');
  }

  async deleteComment(commentId: number, user: any) {
    const c = await this.prisma.comment.findUnique({ where: { id: BigInt(commentId) } });
    if (!c) throw new NotFoundException('Comment not found');
    if (c.authorId !== BigInt(user.id)) throw new ForbiddenException('Not your comment');
    await this.prisma.comment.delete({ where: { id: BigInt(commentId) } });
    return this.ok(null, 'Comment deleted');
  }
}
