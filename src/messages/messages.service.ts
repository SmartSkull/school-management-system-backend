import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MessagesService {
  constructor(private db: DatabaseService) {}

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  private uid(user: any): string {
    return String(user.student_id ?? user.unique_id ?? '');
  }

  async getConversations(user: any) {
    const userId = this.uid(user);
    const chats = await this.db.query(
      'SELECT DISTINCT IF(sender_id = ?, receiver_id, sender_id) as chat_with FROM messages WHERE sender_id = ? OR receiver_id = ?',
      [userId, userId, userId],
    );
    const conversations = [];
    for (const chat of chats as any[]) {
      const chatUser = await this.db.queryOne<any>('SELECT student_id as id, firstname, lastname, image FROM users WHERE student_id = ?', [chat.chat_with])
        ?? await this.db.queryOne<any>('SELECT unique_id as id, firstname, lastname, image FROM staff WHERE unique_id = ?', [chat.chat_with]);
      if (!chatUser) continue;
      const lastMsg = await this.db.queryOne<any>('SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY id DESC LIMIT 1', [userId, chat.chat_with, chat.chat_with, userId]);
      const unread = await this.db.count('messages', "sender_id = ? AND receiver_id = ? AND is_read = '0'", [chat.chat_with, userId]);
      conversations.push({ user: chatUser, last_message: lastMsg?.message, last_time: lastMsg?.created_at, unread_count: unread });
    }
    return this.ok(conversations);
  }

  async getMessages(user: any, otherId: string) {
    const userId = this.uid(user);
    const messages = await this.db.query(
      'SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY id ASC',
      [userId, otherId, otherId, userId],
    );
    await this.db.update('messages', { is_read: '1' }, 'sender_id = ? AND receiver_id = ?', [otherId, userId]);
    return this.ok(messages);
  }

  async sendMessage(user: any, body: any) {
    if (!body.to || !body.message) throw new BadRequestException('to and message are required');
    const id = await this.db.insert('messages', { sender_id: this.uid(user), receiver_id: body.to, message: body.message, is_read: '0', created_at: new Date() });
    return this.ok({ id }, 'Message sent');
  }

  async getUnreadCount(user: any) {
    const count = await this.db.count('messages', "receiver_id = ? AND is_read = '0'", [this.uid(user)]);
    return this.ok({ count });
  }

  async deleteConversation(user: any, otherId: string) {
    const userId = this.uid(user);
    await this.db.delete('messages', '(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', [userId, otherId, otherId, userId]);
    return this.ok(null, 'Conversation deleted');
  }

  async uploadAttachment(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const type = file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('video/') ? 'video' : 'file';
    return this.ok({ filename: file.filename, original_name: file.originalname, type, size: file.size, url: `/uploads/messages/${file.filename}` }, 'File uploaded successfully');
  }

  async getUsers(search?: string) {
    const staff = await this.db.query('SELECT unique_id as id, firstname, lastname, image FROM staff LIMIT 50');
    const students = await this.db.query('SELECT student_id as id, firstname, lastname, image FROM users LIMIT 50');
    const all = [
      ...(staff as any[]).map(s => ({ ...s, type: 'staff' })),
      ...(students as any[]).map(s => ({ ...s, type: 'student' })),
    ];
    const filtered = search
      ? all.filter(u => `${u.firstname} ${u.lastname}`.toLowerCase().includes(search.toLowerCase()))
      : all;
    return this.ok(filtered);
  }
}
