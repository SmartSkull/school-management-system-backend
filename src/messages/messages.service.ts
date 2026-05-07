import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private uid(user: any): string {
    return String(user.student_id ?? user.unique_id ?? '');
  }

  async getConversations(user: any) {
    const userId = this.uid(user);
    const rows = await this.prisma.messages.findMany({
      where: { OR: [{ incoming_id: userId }, { outgoing_id: userId }] },
      orderBy: { timestamp: 'desc' },
    });
    const chatIds = [...new Set(rows.map(row => row.incoming_id === userId ? row.outgoing_id : row.incoming_id))];
    const conversations = [];
    for (const chatWith of chatIds) {
      const chatUser = await this.findChatUser(chatWith);
      if (!chatUser) continue;
      const thread = rows.filter(row => [row.incoming_id, row.outgoing_id].includes(chatWith));
      const lastMsg = thread[0];
      const unread = thread.filter(row => row.outgoing_id === chatWith && row.incoming_id === userId && !row.is_read).length;
      conversations.push({ user: chatUser, last_message: lastMsg?.message, last_time: lastMsg?.timestamp, unread_count: unread });
    }
    return this.ok(conversations);
  }

  async getMessages(user: any, otherId: string) {
    const userId = this.uid(user);
    const messages = await this.prisma.messages.findMany({
      where: {
        OR: [
          { incoming_id: userId, outgoing_id: otherId },
          { incoming_id: otherId, outgoing_id: userId },
        ],
      },
      orderBy: { msg_id: 'asc' },
    });
    await this.prisma.messages.updateMany({
      where: { outgoing_id: otherId, incoming_id: userId },
      data: { is_read: true },
    });
    return this.ok(messages);
  }

  async sendMessage(user: any, body: any) {
    if (!body.to || !body.message) throw new BadRequestException('to and message are required');
    const message = await this.prisma.messages.create({
      data: { outgoing_id: this.uid(user), incoming_id: body.to, message: body.message, alert: '0', is_read: false },
    });
    return this.ok({ id: message.msg_id }, 'Message sent');
  }

  async getUnreadCount(user: any) {
    const count = await this.prisma.messages.count({ where: { incoming_id: this.uid(user), is_read: false } });
    return this.ok({ count });
  }

  async deleteConversation(user: any, otherId: string) {
    const userId = this.uid(user);
    await this.prisma.messages.deleteMany({
      where: {
        OR: [
          { incoming_id: userId, outgoing_id: otherId },
          { incoming_id: otherId, outgoing_id: userId },
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
    const [staff, students] = await Promise.all([
      this.prisma.staff.findMany({ take: 50, select: { unique_id: true, firstname: true, lastname: true, image: true } }),
      this.prisma.users.findMany({ take: 50, select: { student_id: true, firstname: true, lastname: true, image: true } }),
    ]);
    const all = [
      ...staff.map(s => ({ id: s.unique_id, firstname: s.firstname, lastname: s.lastname, image: s.image, type: 'staff' })),
      ...students.map(s => ({ id: s.student_id, firstname: s.firstname, lastname: s.lastname, image: s.image, type: 'student' })),
    ];
    const filtered = search
      ? all.filter(u => `${u.firstname} ${u.lastname}`.toLowerCase().includes(search.toLowerCase()))
      : all;
    return this.ok(filtered);
  }

  private async findChatUser(id: string) {
    const student = await this.prisma.users.findFirst({ where: { student_id: id }, select: { student_id: true, firstname: true, lastname: true, image: true } });
    if (student) return { id: student.student_id, firstname: student.firstname, lastname: student.lastname, image: student.image };
    const staff = await this.prisma.staff.findFirst({ where: { unique_id: id }, select: { unique_id: true, firstname: true, lastname: true, image: true } });
    return staff ? { id: staff.unique_id, firstname: staff.firstname, lastname: staff.lastname, image: staff.image } : null;
  }
}
