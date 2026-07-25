import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private webPush: WebPushService,
  ) {}

  /**
   * Create a DB notification and fire both Expo (mobile) and Web push
   * notifications to the user's registered devices.
   */
  async notify(
    userId: bigint | number,
    title: string,
    message: string,
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' = 'INFO',
  ) {
    const uid = BigInt(userId);

    // Create DB record
    await this.prisma.notification.create({
      data: { userId: uid, title, message, type },
    });

    // Fire push — fetch token, ignore if missing
    const user = await this.prisma.user.findUnique({
      where: { id: uid },
      select: { pushToken: true },
    });

    // Expo mobile push (fire-and-forget)
    if (user?.pushToken) {
      this.push.sendOne(user.pushToken, title, message).catch(() => {});
    }

    // Web push (fire-and-forget)
    this.webPush.sendToUser(uid, title, message).catch(() => {});
  }

  /**
   * Send a push-only notification (no DB record) — useful for real-time
   * events like bus location updates where no persistent record is needed.
   */
  async pushOnly(
    userId: bigint | number,
    title: string,
    message: string,
    data?: Record<string, any>,
  ) {
    const uid = BigInt(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: uid },
      select: { pushToken: true },
    });
    if (user?.pushToken) {
      this.push.sendOne(user.pushToken, title, message, data).catch(() => {});
    }
    this.webPush.sendToUser(uid, title, message, data).catch(() => {});
  }
}
