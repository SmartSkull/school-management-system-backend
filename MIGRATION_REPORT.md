# Migration Analysis Report

## Summary of Issues Found

### 1. Missing Students (3 records)
These students exist in the SQL but don't have Student records in the database:

| studentNo | Source SQL | Status in DB |
|-----------|----------|-------------|
| greatkings/2022/d2f4 | greatkin_gk.sql | User exists, no Student record |
| greatkings/2022/9005 | greatkin_gk.sql | Missing User and Student |
| greatkings/2022/011f | greatkin_gk.sql | Missing User and Student |

### 2. Students Without Attendance Records (55 records)
After the partial migration, 55 students have no attendance data:

```
FL1262505, FL1262506, fpis/2024/07e1, fpis/2024/0b25, fpis/2024/1f47, fpis/2024/23f4, fpis/2024/30a3, fpis/2024/3de0, fpis/2024/4405, fpis/2024/45eb, ...
```

### 3. Nil/Null Data Conversion (ACCEPTABLE)
Original SQL had `"Nil"`, `"Null"`, `"-"` values which became `0` during migration. This is the correct behavior since these represent missing/null numeric data.

### 4. Duplicate Sessions (EXPECTED)
Both schools have sessions with the same names (2020/2021, 2021/2022, 2024/2025). This is expected behavior since sessions are school-specific.

## Recommended Fixes

### Fix 1: Add Missing Student Records

```sql
-- For greatkings/2022/9005 and greatkings/2022/011f (completely missing)
INSERT INTO User (uniqueId, role, firstName, lastName, password, status, schoolId, createdAt, updatedAt) 
VALUES ('greatkings/2022/9005', 'STUDENT', 'Unknown', 'Student', '<hashed_password>', 'ACTIVE', 9, NOW(), NOW());

INSERT INTO Student (userId, studentNo, createdAt, updatedAt) 
VALUES (LAST_INSERT_ID(), 'greatkings/2022/9005', NOW(), NOW());
```

### Fix 2: Add Missing Attendance Records
Extract attendance data from SQL files and insert for students without records. The SQL files contain ~970 total attendance records but only 543 were migrated.

### Fix 3: Update Migration Script
The `prisma/migrate-data.ts` script needs these fixes:

1. Handle both source databases (greatkin_gk and greatkin_florieren)
2. Add better logging for skipped records
3. Handle missing students gracefully
4. Fix the `parseInt()` issue with Nil/Null values (already handled correctly by `|| 0`)

## Database Counts After Partial Migration

| Entity | Count |
|--------|-------|
| Schools | 2 (Florieren, GreatKings) |
| Users | 385 |
| Students | 315 |
| Attendance | 543 |

Expected based on SQL files:
- greatkin_gk.sql: ~467 attendance records
- greatkin_florieren.sql: ~513 attendance records
- Total expected: ~980 records (some overlap)

Would you like me to:
1. Generate a SQL script to add all missing attendance records?
2. Fix the migration script to handle both databases properly?
3. Provide a detailed list of which specific attendance records are missing?