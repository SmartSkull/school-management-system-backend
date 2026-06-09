import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  private readonly from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  private readonly logger = new Logger(EmailService.name);

  async sendSchoolRegistered(school: {
    name: string; email?: string; slug: string;
    slogan?: string; address?: string; city?: string; state?: string;
    country?: string; telephone?: string; website?: string;
    logo?: string; primaryColor?: string;
  }) {
    if (!school.email) return;
    const color = school.primaryColor || '#1a73e8';
    const location = [school.address, school.city, school.state, school.country].filter(Boolean).join(', ');

    const html = layout(color, `
      ${school.logo ? `<div style="text-align:center;margin-bottom:24px"><img src="${school.logo}" alt="${school.name} logo" style="max-height:80px;max-width:200px;object-fit:contain"/></div>` : ''}
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Registration Received! 🎉</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Your school has been submitted and is pending approval.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
        <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">School Details</h2>
        ${row('School Name', school.name)}
        ${school.slogan ? row('Slogan', school.slogan) : ''}
        ${row('Slug / URL', school.slug)}
        ${school.email ? row('Email', school.email) : ''}
        ${school.telephone ? row('Phone', school.telephone) : ''}
        ${location ? row('Location', location) : ''}
        ${school.website ? row('Website', `<a href="${school.website}" style="color:${color}">${school.website}</a>`) : ''}
      </div>

      <div style="background:${color}15;border-left:4px solid ${color};border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#374151;font-size:14px">
          ⏳ <strong>Status: Pending Approval</strong><br/>
          Our team will review your registration and notify you once it's approved. This usually takes 1–2 business days.
        </p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:14px">If you have any questions, reply to this email and we'll be happy to help.</p>
    `);

    await this.send(school.email, `School Registration Received – ${school.name}`, html);
  }

  async sendStudentCreated(student: { firstName: string; lastName: string; email: string; uniqueId: string; password: string; website?: string }) {
    if (!student.email) return;
    const color = '#1a73e8';
    const websiteLink = student.website ? `<a href="${student.website}" style="color:${color};font-weight:700">${student.website}</a>` : '';

    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Welcome, ${student.firstName}! 👋</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Your student account has been created. Here are your login credentials.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
        <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">Your Credentials</h2>
        ${row('Full Name', `${student.firstName} ${student.lastName}`)}
        ${row('Student ID', `<span style="font-family:monospace;font-size:15px;font-weight:700;color:${color}">${student.uniqueId}</span>`)}
        ${row('Password', `<span style="font-family:monospace;font-size:15px;font-weight:700;color:#dc2626">${student.password}</span>`)}
        ${websiteLink ? row('School Website', websiteLink) : ''}
      </div>

      ${student.website ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${student.website}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 22px">Open School Portal</a>
        </div>
      ` : ''}

      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#92400e;font-size:14px">
          🔒 <strong>Important:</strong> Please log in and change your password immediately to keep your account secure.
        </p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:14px">If you did not expect this email, please contact your school administrator.</p>
    `);

    await this.send(student.email, 'Your Student Account Has Been Created', html);
  }

  async sendStaffCreated(staff: { firstName: string; lastName: string; email: string; uniqueId: string; password: string; website?: string }) {
    if (!staff.email) return;
    const color = '#7c3aed';
    const websiteLink = staff.website ? `<a href="${staff.website}" style="color:${color};font-weight:700">${staff.website}</a>` : '';

    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Welcome to the Team, ${staff.firstName}! 🚀</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Your staff account has been created. Here are your login credentials.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
        <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">Your Credentials</h2>
        ${row('Full Name', `${staff.firstName} ${staff.lastName}`)}
        ${row('Staff ID', `<span style="font-family:monospace;font-size:15px;font-weight:700;color:${color}">${staff.uniqueId}</span>`)}
        ${row('Password', `<span style="font-family:monospace;font-size:15px;font-weight:700;color:#dc2626">${staff.password}</span>`)}
        ${websiteLink ? row('School Website', websiteLink) : ''}
      </div>

      ${staff.website ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${staff.website}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 22px">Open School Portal</a>
        </div>
      ` : ''}

      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#92400e;font-size:14px">
          🔒 <strong>Important:</strong> Please log in and change your password immediately to keep your account secure.
        </p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:14px">If you did not expect this email, please contact your school administrator.</p>
    `);

    await this.send(staff.email, 'Your Staff Account Has Been Created', html);
  }

  async sendPasswordReset(to: string, code: string, name: string) {
    const color = '#1a73e8';
    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Password Reset Request</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Hi ${name}, use the code below to reset your password. It expires in 15 minutes.</p>
      <div style="text-align:center;margin:32px 0">
        <span style="display:inline-block;background:#f3f4f6;border:2px dashed ${color};border-radius:12px;padding:16px 40px;font-size:36px;font-weight:800;letter-spacing:10px;color:#111827;font-family:monospace">${code}</span>
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#92400e;font-size:14px">⚠️ If you did not request a password reset, ignore this email. Your password will not change.</p>
      </div>
    `);
    await this.send(to, 'Your Password Reset Code', html);
  }

  async sendAbsentStudentParent(opts: {
    parentEmail: string;
    studentName: string;
    className: string;
    date: string;
    schoolName: string;
  }) {
    if (!opts.parentEmail) return;
    const color = '#dc2626';
    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Absence Notification 📋</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Dear Parent/Guardian,</p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:24px;margin-bottom:24px">
        ${row('Student', opts.studentName)}
        ${row('Class', opts.className)}
        ${row('Date', opts.date)}
        ${row('School', opts.schoolName)}
        ${row('Status', '<span style="color:#dc2626;font-weight:700">ABSENT</span>')}
      </div>

      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#92400e;font-size:14px">
          ⚠️ Your child was marked absent today. If this is unexpected, please contact the school or the class teacher as soon as possible.
        </p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:14px">If your child was absent due to illness or another reason, please inform the school to update the records.</p>
    `);
    await this.send(opts.parentEmail, `Absence Alert: ${opts.studentName} was absent on ${opts.date}`, html);
  }

  async sendResultApprovedParent(opts: {
    parentEmail: string;
    studentName: string;
    className: string;
    session: string;
    term: string;
    schoolName: string;
    resultUrl?: string;
  }) {
    if (!opts.parentEmail) return;
    const color = '#16a34a';
    const resultLink = opts.resultUrl ? `<a href="${opts.resultUrl}" style="color:${color};font-weight:700">${opts.resultUrl}</a>` : '';
    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Result Approved</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Dear Parent/Guardian,</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin-bottom:24px">
        ${row('Student', opts.studentName)}
        ${row('Class', opts.className)}
        ${row('Session', opts.session)}
        ${row('Term', opts.term)}
        ${row('School', opts.schoolName)}
        ${row('Status', '<span style="color:#16a34a;font-weight:700">APPROVED</span>')}
        ${resultLink ? row('Result Link', resultLink) : ''}
      </div>

      ${opts.resultUrl ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${opts.resultUrl}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 22px">Check Result</a>
        </div>
      ` : ''}
      <p style="margin:0;color:#6b7280;font-size:14px">The result is now available for viewing from the student portal.</p>
    `);
    await this.send(opts.parentEmail, `Result Approved: ${opts.studentName} - ${opts.term} Term`, html);
  }

  async sendLeaveReviewed(opts: {
    email: string;
    staffName: string;
    status: 'APPROVED' | 'REJECTED';
    type: string;
    startDate: Date;
    endDate: Date;
    days: number;
    adminNote?: string | null;
    schoolName: string;
  }) {
    if (!opts.email) return;
    const approved = opts.status === 'APPROVED';
    const color = approved ? '#16a34a' : '#dc2626';
    const statusLabel = `<span style="color:${color};font-weight:700">${opts.status}</span>`;
    const note = opts.adminNote?.trim();
    const dateRange = `${formatDate(opts.startDate)} - ${formatDate(opts.endDate)}`;

    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">Leave Request ${approved ? 'Approved' : 'Rejected'}</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Hello ${opts.staffName}, your leave request has been reviewed.</p>

      <div style="background:${approved ? '#f0fdf4' : '#fef2f2'};border:1px solid ${approved ? '#bbf7d0' : '#fecaca'};border-radius:12px;padding:24px;margin-bottom:24px">
        ${row('Leave Type', opts.type)}
        ${row('Period', dateRange)}
        ${row('Days', String(opts.days))}
        ${row('School', opts.schoolName)}
        ${row('Status', statusLabel)}
        ${note ? row('Admin Note', note) : ''}
      </div>

      <p style="margin:0;color:#6b7280;font-size:14px">Please contact your school administrator if you need more information.</p>
    `);

    await this.send(opts.email, `Leave Request ${opts.status}: ${opts.type}`, html);
  }

  async sendLeaveRequestedAdmin(opts: {
    adminEmail: string;
    adminName: string;
    staffName: string;
    staffNo: string;
    type: string;
    startDate: Date;
    endDate: Date;
    days: number;
    reason: string;
    schoolName: string;
    hasProofFile: boolean;
  }) {
    if (!opts.adminEmail) return;
    const color = '#7c3aed';
    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">New Leave Request</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Hello ${opts.adminName || 'Admin'}, a staff member submitted a leave request.</p>

      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:24px;margin-bottom:24px">
        ${row('Staff', opts.staffName)}
        ${row('Staff ID', opts.staffNo)}
        ${row('Leave Type', opts.type)}
        ${row('Period', `${formatDate(opts.startDate)} - ${formatDate(opts.endDate)}`)}
        ${row('Days', String(opts.days))}
        ${row('School', opts.schoolName)}
        ${row('Supporting File', opts.hasProofFile ? 'Attached' : 'Not attached')}
        ${row('Reason', opts.reason)}
      </div>

      <p style="margin:0;color:#6b7280;font-size:14px">Please review this request from the admin leave management page.</p>
    `);

    await this.send(opts.adminEmail, `New Leave Request: ${opts.staffName} (${opts.type})`, html);
  }

  async sendAssignmentCreatedStudent(opts: {
    studentEmail: string;
    studentName: string;
    subject: string;
    className: string;
    assignment: string;
    dueAt?: Date | null;
    teacherName: string;
    schoolName: string;
    website?: string;
    hasAttachment: boolean;
  }) {
    if (!opts.studentEmail) return;
    const color = '#2563eb';
    const websiteLink = opts.website ? `<a href="${opts.website}" style="color:${color};font-weight:700">${opts.website}</a>` : '';
    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">New Assignment</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Hello ${opts.studentName}, a new assignment has been posted for your class.</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:24px;margin-bottom:24px">
        ${row('Subject', opts.subject)}
        ${row('Class', opts.className)}
        ${row('Teacher', opts.teacherName)}
        ${row('Due Date', opts.dueAt ? formatDate(opts.dueAt) : 'Not specified')}
        ${row('School', opts.schoolName)}
        ${row('Attachment', opts.hasAttachment ? 'Attached' : 'None')}
        ${websiteLink ? row('School Website', websiteLink) : ''}
      </div>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-bottom:24px">
        <p style="margin:0 0 8px;color:#374151;font-size:13px;font-weight:700;text-transform:uppercase">Assignment</p>
        <p style="margin:0;color:#111827;font-size:14px;line-height:1.6">${escapeHtml(opts.assignment)}</p>
      </div>

      ${opts.website ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${opts.website}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 22px">Open School Portal</a>
        </div>
      ` : ''}
      <p style="margin:0;color:#6b7280;font-size:14px">Please log in to your student portal to review and complete the assignment.</p>
    `);

    await this.send(opts.studentEmail, `New Assignment: ${opts.subject}`, html);
  }

  async sendBusProximityAlert(opts: {
    parentEmail: string; studentName: string; plateNumber: string;
    routeName?: string; distanceMeters: number; schoolName: string;
  }) {
    if (!opts.parentEmail) return;
    const color = '#7c3aed';
    const html = layout(color, `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827">🚌 Bus is Almost Here!</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px">Dear Parent/Guardian, the school bus is approaching your location.</p>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:24px;margin-bottom:24px">
        ${row('Student', opts.studentName)}
        ${row('Bus Plate', opts.plateNumber)}
        ${opts.routeName ? row('Route', opts.routeName) : ''}
        ${row('Distance', `~${opts.distanceMeters}m away`)}
        ${row('School', opts.schoolName)}
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:16px">
        <p style="margin:0;color:#92400e;font-size:14px">⚠️ Please get <strong>${opts.studentName}</strong> ready — the bus will arrive shortly.</p>
      </div>
    `);
    await this.send(opts.parentEmail, `🚌 Bus Alert: ${opts.studentName}'s bus is nearby`, html);
  }

  private async send(to: string, subject: string, html: string) {
    try {
      const recipient = process.env.RESEND_TEST_TO || to;
      this.logger.log(`Sending email to ${recipient} | subject: "${subject}"`);
      const result = await this.resend.emails.send({ from: this.from, to: recipient, subject, html });
      if ((result as any).error) {
        this.logger.error(`Resend rejected email to ${recipient}: ${JSON.stringify((result as any).error)}`);
      } else {
        this.logger.log(`Email sent successfully to ${recipient} | id: ${(result as any).data?.id}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${JSON.stringify(err)}`);
    }
  }
}

function row(label: string, value: string) {
  return `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb">
      <span style="color:#6b7280;font-size:14px;min-width:120px">${label}</span>
      <span style="color:#111827;font-size:14px;font-weight:500;text-align:right;flex:1">${value}</span>
    </div>`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function layout(accentColor: string, content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:${accentColor};padding:32px 40px;text-align:center">
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.5px">Florieren</p>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.75)">School Management Platform</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Florieren. All rights reserved.</p>
          <p style="margin:6px 0 0;font-size:12px;color:#9ca3af">This is an automated message — please do not reply directly.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
