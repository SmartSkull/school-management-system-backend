import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../common/notification.service';
import { MessagesGateway } from './messages.gateway';
import { uploadToCloudinary } from '../common/cloudinary';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private notificationService: NotificationService, private gateway: MessagesGateway) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private schoolId(user: any): bigint | undefined {
    // For staff, schoolId may be on the nested user object
    const sid = user?.schoolId ?? user?.user?.schoolId;
    return sid ? BigInt(sid) : undefined;
  }

  /** Returns the real User.id regardless of whether the request came from a
   *  student (req.user IS the User row) or staff (req.user IS the Staff row,
   *  real user id is in authUserId / user.userId). */
  private userId(user: any): bigint {
    // authUserId is set by JwtAuthGuard: user.userId (staff) ?? user.id (student/admin)
    const id = user?.authUserId ?? user?.userId ?? user?.id;
    return BigInt(id);
  }

  /** The user's uniqueId string (e.g. STF001, STU042) for socket room keys. */
  private uniqueId(user: any): string {
    return user?.uniqueId ?? user?.user?.uniqueId ?? String(user?.authUserId ?? user?.id);
  }

  async getConversations(user: any) {
    const userId = this.userId(user);
    const schoolId = this.schoolId(user);

    // Get latest message per conversation partner (MySQL compatible)
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT sub.partner_id, sub.body, sub.created_at
      FROM (
        SELECT
          CASE WHEN senderId = ? THEN receiverId ELSE senderId END AS partner_id,
          body, createdAt AS created_at,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN senderId = ? THEN receiverId ELSE senderId END
            ORDER BY createdAt DESC
          ) AS rn
        FROM Message
        WHERE senderId = ? OR receiverId = ?
      ) sub
      WHERE sub.rn = 1
    `, userId, userId, userId, userId);

    if (!rows.length) return this.ok([]);

    const partnerIds = rows.map(r => BigInt(r.partner_id));
    const partners = await this.prisma.user.findMany({
      where: { id: { in: partnerIds }, ...(schoolId ? { schoolId } : {}) },
      select: { id: true, firstName: true, lastName: true, image: true, uniqueId: true, lastLoginAt: true },
    });
    const partnerMap = new Map(partners.map(p => [p.id, p]));

    const unreadRows = await this.prisma.message.groupBy({
      by: ['senderId'],
      where: { receiverId: userId, readAt: null, senderId: { in: partnerIds } },
      _count: { id: true },
    });
    const unreadMap = new Map(unreadRows.map(r => [r.senderId, r._count.id]));

    const conversations = [];
    for (const row of rows) {
      const partner = partnerMap.get(BigInt(row.partner_id));
      if (!partner) continue;
      conversations.push({
        user_id: partner.uniqueId,
        name: `${partner.firstName} ${partner.lastName}`,
        image: partner.image,
        last_message: row.body,
        unread: unreadMap.get(partner.id) ?? 0,
        created_at: row.created_at,
        last_login_at: partner.lastLoginAt,
      });
    }
    return this.ok(conversations);
  }

  async getMessages(user: any, otherUniqueId: string) {
    if (!otherUniqueId) throw new BadRequestException('with parameter is required');
    const userId = this.userId(user);
    const otherUser = await this.prisma.user.findUnique({ 
      where: { uniqueId: otherUniqueId },
      select: { id: true, schoolId: true, lastLoginAt: true }
    });
    if (!otherUser) throw new NotFoundException('User not found');
    if (this.schoolId(user) && otherUser.schoolId !== this.schoolId(user)) throw new NotFoundException('User not found');

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
        file_url: m.deletedAt ? null : (m.fileUrl ?? null),
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
    const fileUrl = body.file_url || null;
    if (!to || !message) throw new BadRequestException('to and message are required');
    
    const receiver = await this.prisma.user.findUnique({ where: { uniqueId: to } });
    if (!receiver) throw new NotFoundException('Receiver not found');
    if (this.schoolId(user) && receiver.schoolId !== this.schoolId(user)) throw new NotFoundException('Receiver not found');

    const msg = await this.prisma.message.create({
      data: { senderId: this.userId(user), receiverId: receiver.id, body: message, fileUrl },
    });

    const senderName = user?.firstName ?? user?.user?.firstName ?? user?.firstname ?? 'Someone';
    this.notificationService.notify(
      receiver.id,
      'New Message',
      `${senderName} sent you a message`,
    );

    this.gateway.broadcastNewMessage(String(receiver.id), {
      id: msg.id.toString(),
      senderId: String(this.userId(user)),
      receiverId: String(receiver.id),
      senderUniqueId: this.uniqueId(user),
      receiverUniqueId: receiver.uniqueId,
      message: msg.body,
      body: msg.body,
      file_url: msg.fileUrl ?? null,
      isMe: false,
      deleted: false,
      edited: false,
      createdAt: msg.createdAt,
      readAt: null,
    });

    return this.ok({ id: msg.id.toString() }, 'Message sent');
  }

  async getUnreadCount(user: any) {
    const count = await this.prisma.message.count({ 
      where: { receiverId: this.userId(user), readAt: null } 
    });
    return this.ok({ count });
  }

  async editMessage(user: any, messageId: string, body: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: BigInt(messageId) } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== this.userId(user)) throw new BadRequestException('Not your message');
    await this.prisma.message.update({ where: { id: BigInt(messageId) }, data: { body, editedAt: new Date() } });
    return this.ok(null, 'Message updated');
  }

  async deleteMessage(user: any, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: BigInt(messageId) } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== this.userId(user)) throw new BadRequestException('Not your message');
    await this.prisma.message.update({ where: { id: BigInt(messageId) }, data: { body: '', deletedAt: new Date() } });
    return this.ok(null, 'Message deleted');
  }

  async deleteConversation(user: any, otherUniqueId: string) {
    const userId = this.userId(user);
    const otherUser = await this.prisma.user.findUnique({ where: { uniqueId: otherUniqueId } });
    if (!otherUser) throw new NotFoundException('User not found');
    if (this.schoolId(user) && otherUser.schoolId !== this.schoolId(user)) throw new NotFoundException('User not found');

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
    const mime = file.mimetype;
    const type = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
    const url = await uploadToCloudinary(file, 'florieren/messages');
    return this.ok({ url, type, original_name: file.originalname, size: file.size }, 'File uploaded successfully');
  }

  async getUsers(user: any, search?: string, role?: string, className?: string) {
    const where: any = { status: 'ACTIVE' };
    const schoolId = this.schoolId(user);
    if (schoolId) where.schoolId = schoolId;
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
