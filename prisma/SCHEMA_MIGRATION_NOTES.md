# Florieren Database Restructure Plan

`schema.target.prisma` is the recommended normalized database design. Do not run it directly against the existing database until data migration scripts are prepared.

## Main Improvements

- One `User` table for login identity, with `Student` and `Staff` profile tables.
- Clean names: `ClassRoom`, `AcademicSession`, `AcademicTerm`, `Subject`, `Result`, `Attendance`.
- Proper relations instead of string-only links.
- No duplicate legacy tables like `post/posts`, `term/terms`, `session/sessions`, `notification/notifications`.
- Payment, CBT, messages, posts, library, and assignments have clear ownership and foreign keys.

## Safe Migration Order

1. Keep the existing database running with the current `schema.prisma`.
2. Create a new development database.
3. Apply `schema.target.prisma` to the new database.
4. Write migration scripts from old tables to new tables.
5. Update services to use the new model names and relations.
6. Test all endpoints against the new database.
7. Back up production data.
8. Run migration during maintenance window.

## High-Risk Areas

- Student/staff IDs currently live as strings in many tables.
- Some legacy tables store numbers and dates as strings.
- Notifications currently mix `BigInt` and string user IDs.
- School fees and scratch-card payment flows are separate and should be unified carefully.
- Results currently store scores as strings; the target schema stores them as decimals.

## Recommended Next Step

Create a migration script that reads from the existing Prisma models and writes into the target schema in this order:

1. Schools
2. Users
3. Students and staff
4. Sessions and terms
5. Classes and subjects
6. Results and attendance
7. Fees and payments
8. Posts, comments, likes, messages
9. CBT tests, questions, answers, and results
