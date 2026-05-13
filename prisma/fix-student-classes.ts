import { PrismaClient as LegacyClient } from '@generated/legacy-client';
import { PrismaClient as TargetClient } from '@generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  connectionLimit: 10,
};

const legacy = new LegacyClient({ adapter: new PrismaMariaDb({ ...dbConfig, database: 'florieren' }) } as any);
const target = new TargetClient({ adapter: new PrismaMariaDb({ ...dbConfig, database: 'florieren_v2' }) } as any);

async function run() {
  const oldStudents = await legacy.users.findMany({ select: { student_id: true, class: true } });
  const classRooms = await target.classRoom.findMany();
  const classMap = new Map(classRooms.map(c => [c.name.toLowerCase().trim(), c.id]));

  let updated = 0, skipped = 0;

  for (const s of oldStudents) {
    if (!s.class) { skipped++; continue; }
    const classRoomId = classMap.get(s.class.toLowerCase().trim());
    if (!classRoomId) { console.warn(`No classRoom found for: "${s.class}"`); skipped++; continue; }

    await target.student.updateMany({
      where: { studentNo: s.student_id },
      data: { classRoomId },
    });
    updated++;
  }

  console.log(`✅ Updated: ${updated}, Skipped: ${skipped}`);
  await legacy.$disconnect();
  await target.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
