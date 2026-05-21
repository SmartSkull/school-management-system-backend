process.env.DATABASE_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const { PrismaClient } = require('@generated/prisma');
const p = new PrismaClient();

async function main() {
  const rows = await p.studentAttendance.findMany({
    take: 10,
    include: { student: { include: { user: true } } },
    orderBy: { id: 'desc' },
  });

  console.log('=== StudentAttendance rows ===');
  rows.forEach(r => {
    console.log({
      id: r.id.toString(),
      studentId: r.studentId.toString(),
      date: r.date,
      status: r.status,
      student_userId: r.student?.userId?.toString(),
      student_name: r.student?.user ? `${r.student.user.firstName} ${r.student.user.lastName}` : 'NO STUDENT',
      user_schoolId: r.student?.user?.schoolId?.toString(),
    });
  });

  if (rows.length === 0) {
    console.log('NO ROWS FOUND - checking if any exist without join...');
    const raw = await p.studentAttendance.findMany({ take: 10, orderBy: { id: 'desc' } });
    console.log('Raw rows:', raw.map(r => ({ id: r.id.toString(), studentId: r.studentId.toString(), date: r.date })));
  }
}

main().catch(console.error).finally(() => p.$disconnect());
