import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/messages' })
export class MessagesGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId (string) → Set of socket ids currently connected for that user
  private onlineUsers = new Map<string, Set<string>>();
  // socketId → userId  (so we can look up on disconnect)
  private socketUser = new Map<string, string>();

  constructor(@Inject(forwardRef(() => MessagesService)) private messages: MessagesService) {}

  @SubscribeMessage('user:join')
  handleUserJoin(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    const userId = String(data.userId);
    client.join(`user:${userId}`);

    // Track presence
    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, new Set());
    }
    const wasOffline = this.onlineUsers.get(userId)!.size === 0;
    this.onlineUsers.get(userId)!.add(client.id);
    this.socketUser.set(client.id, userId);

    // Broadcast online status to everyone watching this user
    if (wasOffline) {
      this.server.emit('user:online', { userId });
    }
  }

  @SubscribeMessage('user:status')
  handleUserStatus(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    const userId = String(data.userId);
    const isOnline = (this.onlineUsers.get(userId)?.size ?? 0) > 0;
    client.emit('user:status', { userId, online: isOnline });
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    this.socketUser.delete(client.id);
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(userId);
        // Broadcast offline status
        this.server.emit('user:offline', { userId });
      }
    }
  }

  broadcastNewMessage(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('new:message', payload);
  }
}
