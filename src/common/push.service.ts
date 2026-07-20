import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  /**
   * Send one or more push notifications via Expo's push API.
   * Silently ignores invalid/expired tokens so a bad token never
   * breaks the calling service.
   */
  async send(messages: PushMessage[]): Promise<void> {
    const valid = messages.filter(m =>
      m.to && m.to.startsWith('ExponentPushToken['),
    );
    if (!valid.length) return;

    const chunks = this.chunk(valid, 100); // Expo max 100 per request
    for (const chunk of chunks) {
      try {
        await this.post(chunk);
      } catch (err) {
        this.logger.warn(`Push send failed: ${err}`);
      }
    }
  }

  /** Convenience: send to a single token, fire-and-forget */
  async sendOne(
    token: string | null | undefined,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    if (!token) return;
    await this.send([{ to: token, title, body, data, sound: 'default' }]);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  private post(messages: PushMessage[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(messages);
      const req = https.request(
        {
          hostname: 'exp.host',
          path: '/--/api/v2/push/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        res => {
          res.resume(); // drain response
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
