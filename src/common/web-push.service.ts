import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly enabled: boolean;

  constructor(private prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@smartcampus.com.ng';

    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.enabled = true;
    } else {
      this.logger.warn('VAPID keys not set — web push disabled');
      this.enabled = false;
    }
  }

  /** Save or update a browser push subscription for a user */
  async saveSubscription(
    userId: bigint,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.prisma.webPushSubscription.upsert({
      where: { userId_endpoint: { userId, endpoint: subscription.endpoint } },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
  }

  /** Send a push notification to all browser subscriptions for a user */
  async sendToUser(
    userId: bigint,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    if (!this.enabled) return;

    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: { userId },
    });

    if (!subscriptions.length) return;

    const payload = JSON.stringify({ title, body, ...data });
    const staleIds: bigint[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err: any) {
          // 404/410 means the subscription is expired — remove it
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            staleIds.push(sub.id);
          } else {
            this.logger.warn(`Web push failed for sub ${sub.id}: ${err?.message}`);
          }
        }
      }),
    );

    if (staleIds.length) {
      await this.prisma.webPushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    }
  }
}
