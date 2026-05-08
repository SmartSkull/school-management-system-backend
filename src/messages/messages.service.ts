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
        sender: { select: { id: true, firstName: true, lastName: true, image: true, uniqueId: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, image: true, uniqueId: true } }
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
        user: {
          id: partner.uniqueId,
          db_id: partner.id.toString(),
          firstname: partner.firstName,
          lastname: partner.lastName,
          image: partner.image
        }, 
        last_message: msg.body, 
        last_time: msg.createdAt, 
        unread_count: unreadCount 
      });
    }
    return this.ok(conversations);
  }

  async getMessages(user: any, otherUniqueId: string) {
    const userId = BigInt(user.id);
    const otherUser = await this.prisma.user.findUnique({ where: { uniqueId: otherUniqueId } });
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

    return this.ok(messages.map(m => ({ ...m, id: m.id.toString(), senderId: m.senderId.toString(), receiverId: m.receiverId.toString() })));
  }

  async sendMessage(user: any, body: any) {
    if (!body.to || !body.message) throw new BadRequestException('to and message are required');
    
    const receiver = await this.prisma.user.findUnique({ where: { uniqueId: body.to } });
    if (!receiver) throw new NotFoundException('Receiver not found');

    const message = await this.prisma.message.create({
      data: { 
        senderId: BigInt(user.id), 
        receiverId: receiver.id, 
        body: body.message 
      },
    });
    return this.ok({ id: message.id.toString() }, 'Message sent');
  }

  async getUnreadCount(user: any) {
    const count = await this.prisma.message.count({ 
      where: { receiverId: BigInt(user.id), readAt: null } 
    });
    return this.ok({ count });
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

  async getUsers(search?: string) {
    const users = await this.prisma.user.findMany({
      take: 100,
      where: search ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { uniqueId: { contains: search } }
        ]
      } : {},
      select: { uniqueId: true, firstName: true, lastName: true, image: true, role: true }
    });
    
    return this.ok(users.map(u => ({ 
      id: u.uniqueId, 
      firstname: u.firstName, 
      lastname: u.lastName, 
      image: u.image, 
      type: u.role.toLowerCase() 
    })));
  }
}
