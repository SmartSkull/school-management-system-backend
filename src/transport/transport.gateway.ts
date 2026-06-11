import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TransportService } from './transport.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/transport' })
export class TransportGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // busId → socketId mapping for connected drivers
  private driverSockets = new Map<string, string>();

  constructor(@Inject(forwardRef(() => TransportService)) private transport: TransportService) {}

  handleDisconnect(client: Socket) {
    for (const [busId, socketId] of this.driverSockets.entries()) {
      if (socketId === client.id) { this.driverSockets.delete(busId); break; }
    }
  }

  // Driver authenticates with their driverToken, joins bus room
  @SubscribeMessage('driver:join')
  async handleDriverJoin(@MessageBody() data: { token: string }, @ConnectedSocket() client: Socket) {
    const bus = await this.transport.getBusByDriverToken(data.token);
    if (!bus) { client.emit('error', 'Invalid token'); return; }
    client.join(`bus:${bus.id}`);
    this.driverSockets.set(String(bus.id), client.id);
    client.emit('driver:joined', { busId: String(bus.id), plateNumber: bus.plateNumber });
  }

  // Driver sends GPS update
  @SubscribeMessage('driver:gps')
  async handleGpsUpdate(@MessageBody() data: { token: string; lat: number; lng: number }, @ConnectedSocket() client: Socket) {
    const bus = await this.transport.getBusByDriverToken(data.token);
    if (!bus || !bus.tripActive) return;

    await this.transport.updateGpsAndCheckProximity(String(bus.id), data.lat, data.lng);

    // Broadcast to admin watchers
    this.server.to(`watch:${bus.id}`).emit('bus:location', {
      busId: String(bus.id),
      plateNumber: bus.plateNumber,
      lat: data.lat,
      lng: data.lng,
      updatedAt: new Date().toISOString(),
    });
  }

  // Admin/parent watches a bus
  @SubscribeMessage('watch:bus')
  handleWatch(@MessageBody() data: { busId: string }, @ConnectedSocket() client: Socket) {
    client.join(`watch:${data.busId}`);
  }

  // Student watches their assigned bus (joins by busId)
  @SubscribeMessage('student:watch')
  handleStudentWatch(@MessageBody() data: { busId: string }, @ConnectedSocket() client: Socket) {
    client.join(`watch:${data.busId}`);
  }

  // Broadcast to all watchers (called from service after DB update)
  broadcastLocation(busId: string, payload: any) {
    this.server.to(`watch:${busId}`).emit('bus:location', payload);
  }

  broadcastPickup(busId: string, studentUniqueId: string, pickedUp: boolean, pickedUpAt: string | null) {
    this.server.to(`watch:${busId}`).emit('student:pickedup', { busId, studentUniqueId, pickedUp, pickedUpAt });
  }
}
