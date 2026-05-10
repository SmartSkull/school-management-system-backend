import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async getConversations(user: any) {
    const userId = BigInt(user.id);
    const rows = await this.prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: { 
        sender: { select: { id: true, firstName: true, lastName: true, image: true, uniqueId: true, lastLoginAt: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, image: true, uniqueId: true, lastLoginAt: true } }
      }
    });

    const chatPartners = new Map<bigint, any>();
    const conversations = [];

    for (const msg of rows) {
      const partner = msg.senderId === userId ? msg.receiver : msg.sender;
      if (chatPartners.has(partner.id)) continue;

      const thread = rows.filter(m => m.senderId === partner.id || m.receiverId === partner.id);
      const unreadCount = thread.filter(m => m.receiverId === userId && !m.readAt).length;

      chatPartners.set(partner.id, partner);
      conversations.push({ 
        user_id: partner.uniqueId,
        name: `${partner.firstName} ${partner.lastName}`,
        image: partner.image,
        last_message: msg.body, 
        unread: unreadCount,
        created_at: msg.createdAt,
        last_login_at: partner.lastLoginAt,
      });
    }
    return this.ok(conversations);
  }

  async getMessages(user: any, otherUniqueId: string) {
    if (!otherUniqueId) throw new BadRequestException('with parameter is required');
    const userId = BigInt(user.id);
    const otherUser = await this.prisma.user.findUnique({ 
      where: { uniqueId: otherUniqueId },
      select: { id: true, lastLoginAt: true }
    });
    if (!otherUser) throw new NotFoundException('User not found');

    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUser.id },
          { senderId: otherUser.id, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.message.updateMany({
      where: { senderId: otherUser.id, receiverId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    return this.ok({ 
      messages: messages.map(m => ({ 
        id: m.id.toString(), 
        senderId: m.senderId.toString(), 
        receiverId: m.receiverId.toString(), 
        message: m.deletedAt ? '' : m.body,
        body: m.deletedAt ? '' : m.body,
        isMe: m.senderId === userId,
        deleted: !!m.deletedAt,
        edited: !!m.editedAt,
        createdAt: m.createdAt,
        readAt: m.readAt,
      })),
      partner_last_login_at: otherUser.lastLoginAt,
    });
  }

  async sendMessage(user: any, body: any) {
    const to = body.to || body.receiver_id;
    const message = body.message;
    if (!to || !message) throw new BadRequestException('to and message are required');
    
    const receiver = await this.prisma.user.findUnique({ where: { uniqueId: to } });
    if (!receiver) throw new NotFoundException('Receiver not found');

    const msg = await this.prisma.message.create({
      data: { senderId: BigInt(user.id), receiverId: receiver.id, body: message },
    });
    return this.ok({ id: msg.id.toString() }, 'Message sent');
  }

  async getUnreadCount(user: any) {
    const count = await this.prisma.message.count({ 
      where: { receiverId: BigInt(user.id), readAt: null } 
    });
    return this.ok({ count });
  }

  async editMessage(user: any, messageId: string, body: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: BigInt(messageId) } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== BigInt(user.id)) throw new BadRequestException('Not your message');
    await this.prisma.message.update({ where: { id: BigInt(messageId) }, data: { body, editedAt: new Date() } });
    return this.ok(null, 'Message updated');
  }

  async deleteMessage(user: any, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: BigInt(messageId) } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== BigInt(user.id)) throw new BadRequestException('Not your message');
    await this.prisma.message.update({ where: { id: BigInt(messageId) }, data: { body: '', deletedAt: new Date() } });
    return this.ok(null, 'Message deleted');
  }

  async deleteConversation(user: any, otherUniqueId: string) {
    const userId = BigInt(user.id);
    const otherUser = await this.prisma.user.findUnique({ where: { uniqueId: otherUniqueId } });
    if (!otherUser) throw new NotFoundException('User not found');

    await this.prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUser.id },
          { senderId: otherUser.id, receiverId: userId },
        ],
      },
    });
    return this.ok(null, 'Conversation deleted');
  }

  async uploadAttachment(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const type = file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('video/') ? 'video' : 'file';
    return this.ok({ filename: file.filename, original_name: file.originalname, type, size: file.size, url: `/uploads/messages/${file.filename}` }, 'File uploaded successfully');
  }

  async getUsers(search?: string, role?: string, className?: string) {
    const where: any = {};
    if (search) where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { uniqueId: { contains: search } },
    ];
    if (role === 'student') {
      where.role = 'STUDENT';
      if (className) where.student = { classRoom: { name: className } };
    } else if (role === 'staff') {
      where.role = 'STAFF';
    }

    const users = await this.prisma.user.findMany({
      take: 100, where,
      select: { uniqueId: true, firstName: true, lastName: true, image: true, role: true,
        student: { select: { classRoom: { select: { name: true } } } } },
      orderBy: { firstName: 'asc' },
    });

    return this.ok(users.map(u => ({
      id: u.uniqueId,
      firstname: u.firstName,
      lastname: u.lastName,
      image: u.image,
      role: u.role.toLowerCase(),
      class: u.student?.classRoom?.name ?? null,
    })));
  }
}
