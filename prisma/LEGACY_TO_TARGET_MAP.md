# Legacy to Target Schema Map

This map explains how data should move from the current introspected schema to `schema.target.prisma`.

## Identity

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `users` | `User` + `Student` | Create one `User` with `role = STUDENT`, then one `Student` profile. `users.student_id` becomes `User.uniqueId` and `Student.studentNo`. |
| `staff` where `user != 'admin'` | `User` + `Staff` | Create one `User` with `role = STAFF`, then one `Staff` profile. `staff.unique_id` becomes `User.uniqueId` and `Staff.staffNo`. |
| `staff` where `user = 'admin'` | `User` + `Staff` | Create one `User` with `role = ADMIN`, then one `Staff` profile. |
| `schools` | `School` | Keep one school record. If multiple schools exist, link users/classes/sessions by `school_id`. |

## Academic Setup

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `session` / `sessions` | `AcademicSession` | Prefer `session.session` as the canonical session name. Use `set_session_tbl.set_session` to set `isCurrent`. |
| `term` / `terms` | `AcademicTerm` | Create FIRST, SECOND, THIRD terms per session. Use `set_term_tbl.set_term` to set `isCurrent`. |
| `school_days` | `AcademicTerm.totalDays` | Move `school_days.total_days` into the matching term record. |
| `class` | `ClassRoom` | `class.class` becomes `ClassRoom.name`. `class.class_teacher` should map to `ClassRoom.classTeacherId` via `Staff.staffNo`. |
| `course` | `Subject` | `course.courses` becomes `Subject.name`. `course.teacher` should map to `Staff.staffNo` if possible. |

## Student Records

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `result` | `Result` | Link by `student_id`, `course`, `session`, `term`. Convert score strings to decimals. |
| `attendance` | `Attendance` | Link by `student_id`, `session`, `term`. Convert `present` and `absent` strings to integers. |
| `scratch_card` | transitional/manual payment table | Keep only if manual receipt verification is still needed. Otherwise merge into `SchoolFeePayment`. |

## Fees

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `school_fees_config` | `SchoolFeeConfig` | Link by class, session, and term. |
| `school_fees_payment` | `SchoolFeePayment` | Link by student, session, and term. `paystack_reference` becomes `reference`. |
| `manage_fees_tbl`, `manage_school_fees` | remove or archive | These are legacy fee settings. Replace with `SchoolFeeConfig`. |

## Content and Communication

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `post` / `posts` | `Post` | Prefer the current app table `post`. Link `admin_id` to `User.uniqueId`. |
| `comment` | `Comment` | Link `unique_id` to `User.uniqueId`. |
| `likes` | `Like` | Link `unique_id` to `User.uniqueId` and `post_id` to `Post`. |
| `messages` | `Message` | `outgoing_id` is sender, `incoming_id` is receiver. Link both to `User.uniqueId`. |
| `notifications` / `notification` | `Notification` | Prefer `notifications`. Link `user_id` or `unique_id` to `User.uniqueId` where possible. |

## Staff Tools

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `assignment` / `assignments` | `Assignment` | Prefer `assignment`. Map `subject` to `Subject.name`, `class` to `ClassRoom.name`, `staff_id` to `Staff.staffNo`. |
| `library` | `LibraryResource` | Map `verify` to `ResourceStatus`. `1` means `APPROVED`, otherwise `PENDING`. |
| `lesson_note`, `video` | `LibraryResource` or separate resource tables | Can be migrated into `LibraryResource` with a `type` field if you add one later. |

## CBT

| Legacy table | Target model | Notes |
| --- | --- | --- |
| `cbt` | `CbtTest` + `CbtQuestion` | Group rows by class/course/duration into one test, then create questions. |
| `student_answer` | `CbtAnswer` | Link answer to `Student` and `CbtQuestion`. |
| `cbt_result` | `CbtResult` | Link to `CbtTest` and `Student`. |
| `cbt_session` | optional future model | Add later if timed in-progress CBT sessions matter. |

## Tables to Review Before Migration

- `admin`
- `account`
- `payment`
- `personal_access_tokens`
- `failed_jobs`
- `migrations`
- `password_resets`
- `student_attendance`
- `submit_assignment`
- `test`
- `typing_status`

Some of these may be Laravel leftovers or unused legacy tables.
