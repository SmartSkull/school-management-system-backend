import { PrismaClient as TargetClient } from '@generated/prisma';
import { PrismaClient as LegacyClient } from '@generated/legacy-client';
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

// Initialize Legacy Client
const legacyAdapter = new PrismaMariaDb({
  ...dbConfig,
  database: 'florieren',
});
const legacy = new LegacyClient({ adapter: legacyAdapter } as any);

// Initialize Target Client
const targetAdapter = new PrismaMariaDb({
  ...dbConfig,
  database: 'florieren_v2',
});
const target = new TargetClient({ adapter: targetAdapter } as any);

async function migrate() {
  console.log('🚀 Starting migration...');

  try {
    // 1. Schools
    await migrateSchools();

    // 2. Users (Admin, Staff, Students)
    await migrateUsers();

    // 3. Academic Setup (Sessions, Terms, Classes, Subjects)
    await migrateAcademicSetup();

    // 4. Academic Records (Results, Attendance)
    await migrateAcademicRecords();

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await legacy.$disconnect();
    await target.$disconnect();
  }
}

// ... existing migrateSchools, migrateUsers, migrateAcademicSetup ...

async function migrateAcademicRecords() {
  console.log('--- Migrating Academic Records ---');

  // Subjects
  const oldCourses = await legacy.course.findMany();
  for (const c of oldCourses) {
    await target.subject.upsert({
      where: { classRoomId_name: { classRoomId: 0, name: c.courses } }, // Placeholder for classRoomId
      update: {},
      create: {
        name: c.courses,
      },
    });
  }

  // Map of session names to IDs
  const sessions = await target.academicSession.findMany();
  const sessionMap = new Map(sessions.map(s => [s.name, s.id]));

  // Map of terms
  const terms = await target.academicTerm.findMany({ include: { session: true } });
  const termMap = new Map(terms.map(t => [`${t.session.name}_${t.name}`, t.id]));

  // Results
  const oldResults = await legacy.result.findMany();
  for (const r of oldResults) {
    const student = await target.student.findUnique({ where: { studentNo: r.student_id } });
    if (!student) continue;

    const sessionId = sessionMap.get(r.session);
    const termId = termMap.get(`${r.session}_${r.term.toUpperCase()}`);

    if (sessionId && termId) {
      // Find or create subject for this class
      const subject = await target.subject.findFirst({ where: { name: r.course } });
      if (!subject) continue;

      await target.result.upsert({
        where: {
          studentId_subjectId_sessionId_termId: {
            studentId: student.id,
            subjectId: subject.id,
            sessionId,
            termId,
          }
        },
        update: {},
        create: {
          studentId: student.id,
          subjectId: subject.id,
          sessionId,
          termId,
          testScore: parseFloat(r.test_score) || 0,
          examScore: parseFloat(r.exam_score) || 0,
          totalScore: parseFloat(r.total_score) || 0,
          grade: r.grade,
          remark: r.remark,
        }
      });
    }
  }

  // Attendance
  const oldAttendance = await legacy.attendance.findMany();
  for (const a of oldAttendance) {
    const student = await target.student.findUnique({ where: { studentNo: a.student_id } });
    if (!student) continue;

    const sessionId = sessionMap.get(a.session);
    const termId = termMap.get(`${a.session}_${a.term.toUpperCase()}`);

    if (sessionId && termId) {
      await target.attendance.upsert({
        where: {
          studentId_sessionId_termId: {
            studentId: student.id,
            sessionId,
            termId,
          }
        },
        update: {},
        create: {
          studentId: student.id,
          sessionId,
          termId,
          present: parseInt(a.present) || 0,
          absent: parseInt(a.absent) || 0,
          comment: a.comment,
          principalComment: a.principal_comment,
        }
      });
    }
  }
}

async function migrateSchools() {
  console.log('--- Migrating Schools ---');
  const oldSchools = await legacy.schools.findMany();
  
  for (const s of oldSchools) {
    await target.school.upsert({
      where: { slug: s.slug },
      update: {},
      create: {
        id: s.id,
        name: s.name,
        slug: s.slug,
        email: s.email,
        telephone: s.telephone,
        address: s.address,
        logo: s.logo,
        primaryColor: s.primary_color,
        secondaryColor: s.secondary_color,
        status: s.status === 'active' ? 'ACTIVE' : 'PENDING',
      },
    });
  }
  console.log(`Migrated ${oldSchools.length} schools.`);
}

async function migrateUsers() {
  console.log('--- Migrating Users ---');
  
  // Migrate Admins
  const oldAdmins = await legacy.admin.findMany();
  for (const a of oldAdmins) {
    await target.user.upsert({
      where: { uniqueId: a.unique_id },
      update: {},
      create: {
        uniqueId: a.unique_id,
        role: 'ADMIN',
        firstName: a.other_names,
        lastName: a.surname,
        email: a.email,
        telephone: a.telephone,
        password: a.password,
        image: a.image,
        status: 'ACTIVE',
        staff: {
          create: {
            staffNo: a.unique_id,
            homeAddress: a.home_address,
          }
        }
      },
    });
  }

  // Migrate Staff
  const oldStaff = await legacy.staff.findMany();
  for (const s of oldStaff) {
    await target.user.upsert({
      where: { uniqueId: s.unique_id },
      update: {},
      create: {
        uniqueId: s.unique_id,
        schoolId: s.school_id,
        role: 'STAFF',
        firstName: s.firstname,
        lastName: s.lastname,
        email: s.email,
        telephone: s.telephone,
        password: s.password,
        image: s.image,
        status: 'ACTIVE',
        staff: {
          create: {
            staffNo: s.unique_id,
            stateOfOrigin: s.state_of_origin,
            homeAddress: s.home_address,
            about: s.about,
          }
        }
      },
    });
  }

  // Migrate Students (from 'users' table)
  const oldStudents = await legacy.users.findMany();
  for (const s of oldStudents) {
    await target.user.upsert({
      where: { uniqueId: s.student_id },
      update: {},
      create: {
        uniqueId: s.student_id,
        schoolId: s.school_id,
        role: 'STUDENT',
        firstName: s.firstname,
        middleName: s.middlename,
        lastName: s.lastname,
        email: s.email,
        telephone: s.telephone,
        password: s.password,
        image: s.image,
        status: s.status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
        student: {
          create: {
            studentNo: s.student_id,
            admissionYear: s.year_of_admission,
            stateOfOrigin: s.state_of_origin,
            homeAddress: s.home_address,
            fatherName: s.father_name,
            motherName: s.mother_name,
            parentImage: s.parent_image,
            about: s.about,
          }
        }
      },
    });
  }
  console.log(`Migrated ${oldAdmins.length} admins, ${oldStaff.length} staff, and ${oldStudents.length} students.`);
}

async function migrateAcademicSetup() {
  console.log('--- Migrating Academic Setup ---');
  
  // Sessions
  const oldSessions = await legacy.session.findMany();
  for (const s of oldSessions) {
    await target.academicSession.upsert({
      where: { name: s.session },
      update: {},
      create: {
        name: s.session,
      },
    });
  }

  // Terms
  const terms: ('FIRST' | 'SECOND' | 'THIRD')[] = ['FIRST', 'SECOND', 'THIRD'];
  const allSessions = await target.academicSession.findMany();
  for (const session of allSessions) {
    for (const termName of terms) {
      await target.academicTerm.upsert({
        where: { sessionId_name: { sessionId: session.id, name: termName } },
        update: {},
        create: {
          sessionId: session.id,
          name: termName,
        },
      });
    }
  }

  // Classes
  const oldClasses = await legacy.renamedclass.findMany();
  for (const c of oldClasses) {
    await target.classRoom.upsert({
      where: { name: c.class },
      update: {},
      create: {
        name: c.class,
        // Linking class teacher would require looking up the staff by uniqueId/staffNo
      },
    });
  }
  console.log(`Migrated ${oldSessions.length} sessions and ${oldClasses.length} classes.`);
}

migrate();
