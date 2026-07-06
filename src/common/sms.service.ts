import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private kudiToken: string;
  private senderId: string;

  constructor() {
    this.kudiToken = process.env.KUDISMS_API_KEY || '7YceLygwHDFU9qZKCESA2546BTr3aQOlhfWMnVIGRtzkjsbmiv81u0oNdpxJPX';
    this.senderId = process.env.KUDISMS_SENDER_ID || 'Smart Campu';
  }

  async sendSms(to: string, message: string, schoolName?: string) {
    try {
      // Format phone number. KudiSMS typically accepts standard Nigerian format (e.g. 07031882197 or 2347031882197)
      let phone = to.replace(/\D/g, '');
      if (phone.startsWith('+')) {
        phone = phone.slice(1);
      }

      // Pick the sender ID that belongs to the school sending the message
      const senderId = this.senderIdForSchool(schoolName);

      // KudiSMS v2 API endpoint (form-data, matches documented curl)
      const url = 'https://my.kudisms.net/api/sms';

      const payload = new URLSearchParams();
      payload.append('token', this.kudiToken);
      payload.append('senderID', senderId);
      payload.append('recipients', phone);
      payload.append('message', message);
      payload.append('gateway', process.env.KUDISMS_SMS_GATEWAY || '2');

      const response = await axios.post(url, payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      this.logger.log(`SMS sent to ${phone} via KudiSMS: ${JSON.stringify(response.data)}`);
      
      // If KudiSMS returns an error status, we throw to log it properly
      if (response.data && response.data.status === 'error') {
         throw new Error(response.data.msg || JSON.stringify(response.data));
      }
      
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to send SMS to ${to} via KudiSMS: ${error.message || (error.response ? JSON.stringify(error.response.data) : JSON.stringify(error))}`);
      throw error;
    }
  }

  async sendAbsentStudentSms(parentPhone: string, studentName: string, className: string, date: string, schoolName: string) {
    const message = `Dear Parent, this is to inform you that ${studentName} (${className}) was marked absent from school today (${date}). Please contact the school management for any clarifications. - ${schoolName}`;
    return this.sendSms(parentPhone, message, schoolName);
  }

  async sendResultApprovedSms(parentPhone: string, studentName: string, className: string, session: string, term: string, schoolName: string, resultUrl?: string) {
    const linkText = resultUrl ? ` Check result: ${resultUrl}` : '';
    const message = `Dear Parent, ${studentName}'s result for ${term} term, ${session} session (${className}) has been approved and is now available on the student portal.${linkText} - ${schoolName}`;
    return this.sendSms(parentPhone, message, schoolName);
  }

  private senderIdForSchool(schoolName?: string): string {
    const name = (schoolName || '').toLowerCase();
    if (name.includes('greatkings')) return 'Greatkings';
    if (name.includes('florieren')) return 'Florieren';
    return this.senderId;
  }
}
