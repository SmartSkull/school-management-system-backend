import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async index(q: any, user: any) {
    const page = Math.max(1, parseInt(q.page) || 1);
    const perPage = Math.min(parseInt(q.per_page) || 20, 50);
    
    const posts = await this.prisma.post.findMany({ 
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
        post_id: post.id.toString(),
        has_liked: !!liked,
        likes_count: post._count.likes,
        comments_count: post._count.comments,
        author_name: `${post.author.firstName} ${post.author.lastName}`,
        author_image: post.author.image,
      };
    }));

    const total = await this.prisma.post.count();
    return { success: true, data, meta: { total, page, per_page: perPage } };
  }

  async show(id: number, user: any) {
    const post = await this.prisma.post.findUnique({ 
      where: { id: BigInt(id) },
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
    await this.prisma.post.update({ where: { id: BigInt(id) }, data });
    return this.ok(null, 'Post updated successfully');
  }

  async delete(user: any, id: number) {
    if (user.role !== 'admin') throw new ForbiddenException('Only admins can delete posts');
    await this.prisma.post.delete({ where: { id: BigInt(id) } });
    return this.ok(null, 'Post deleted successfully');
  }

  async like(postId: number, user: any) {
    const userId = BigInt(user.id);
    const post_id = BigInt(postId);
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
    const created = await this.prisma.comment.create({ 
      data: { 
        postId: BigInt(postId), 
        text: comment, 
        authorId: BigInt(user.id) 
      } 
    });
    return this.ok({ id: created.id.toString() }, 'Comment added');
  }
}
