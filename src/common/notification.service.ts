import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PushService } from './push.service';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  /**
   * Create a DB notification and immediately fire an Expo push notification
   * to the user's registered device (if they have a pushToken).
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

    if (user?.pushToken) {
      await this.push.sendOne(user.pushToken, title, message);
    }
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
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { pushToken: true },
    });
    if (user?.pushToken) {
      await this.push.sendOne(user.pushToken, title, message, data);
    }
  }
}
