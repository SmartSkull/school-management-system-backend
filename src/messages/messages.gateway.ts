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

  constructor(@Inject(forwardRef(() => MessagesService)) private messages: MessagesService) {}

  handleDisconnect(client: Socket) {
    // no-op
  }

  @SubscribeMessage('user:join')
  handleUserJoin(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    client.join(`user:${data.userId}`);
  }

  broadcastNewMessage(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('new:message', payload);
  }
}
