# 📚 Complete API Endpoints Documentation

Base URL: `http://localhost:3000`

---

## 🔐 Authentication Endpoints

### Student Login
```
POST /auth/student/login
Body: { "name": "GKA240001", "password": "password123" }
Response: { token, refresh_token, user }
```

### Staff Login
```
POST /auth/staff/login
Body: { "staff_id": "GKS240001", "password": "password123" }
Response: { token, refresh_token, user }
```

### Admin Login
```
POST /auth/admin/login
Body: { "admin_id": "GKA240001", "password": "password123" }
Response: { token, refresh_token, user }
```

### Refresh Token
```
POST /auth/refresh
Body: { "refresh_token": "your_refresh_token" }
Response: { token, refresh_token }
```

### Get Current User
```
GET /auth/me
Headers: Authorization: Bearer {token}
Response: { user }
```

### Logout
```
POST /auth/logout
Headers: Authorization: Bearer {token}
Response: { message: "Logged out successfully" }
```

---

## 👨‍💼 Admin Endpoints

**All admin endpoints require admin authentication**

### Dashboard
```
GET /admin/dashboard
Response: { students, staff, studentsByClass, current_session, current_term, recentActivity }
```

### Student Management

#### Get All Students (with pagination & filters)
```
GET /admin/students?page=1&per_page=20&class=JSS1&status=1&search=john
Response: { data: [...students], meta: { total, page, per_page, last_page } }
```

#### Create Student
```
POST /admin/students
Body: { firstname, lastname, email, telephone, class, gender, password }
Response: { student_id }
```

#### Update Student (URL param)
```
PUT /admin/students/{student_id}
Body: { firstname, lastname, email, telephone, class, gender }
Response: { message }
```

#### Update Student (Body param)
```
POST /admin/students/update
Body: { student_id, firstname, lastname, email, ... }
Response: { message }
```

#### Verify Student (URL param)
```
PUT /admin/students/{student_id}/verify
Response: { message }
```

#### Verify Student (Body param)
```
POST /admin/students/verify
Body: { student_id }
Response: { message }
```

#### Bulk Verify Students
```
POST /admin/students/bulk-verify
Body: { student_ids: ["GKA240001", "GKA240002"] }
Response: { count, message }
```

#### Delete Student (URL param)
```
DELETE /admin/students/{student_id}
Response: { message }
```

#### Delete Student (Body param)
```
POST /admin/students/delete
Body: { student_id }
Response: { message }
```

### Staff Management

#### Get All Staff
```
GET /admin/staff?page=1&per_page=20
Response: { data: [...staff], meta: { total, page, per_page } }
```

#### Create Staff
```
POST /admin/staff
Body: { firstname, lastname, email, telephone, class, course, password }
Response: { unique_id }
```

#### Update Staff (URL param)
```
PUT /admin/staff/{staff_id}
Body: { firstname, lastname, email, telephone, class, course }
Response: { message }
```

#### Update Staff (Body param)
```
POST /admin/staff/update
Body: { staff_id, firstname, lastname, ... }
Response: { message }
```

#### Verify Staff (URL param)
```
POST /admin/staff/{staff_id}/verify
Response: { message }
```

#### Verify Staff (Body param)
```
POST /admin/staff/verify
Body: { staff_id }
Response: { message }
```

#### Delete Staff (URL param)
```
DELETE /admin/staff/{staff_id}
Response: { message }
```

#### Delete Staff (Body param)
```
POST /admin/staff/delete
Body: { staff_id }
Response: { message }
```

### Session & Term Management

#### Get All Sessions
```
GET /admin/sessions
Response: [{ set_session, current_session, current: true/false }]
```

#### Create Session
```
POST /admin/sessions
Body: { session: "2023/2024" }
Response: { message }
```

#### Set Current Session
```
PUT /admin/sessions/{session}/current
Response: { message }
```

#### Delete Session
```
DELETE /admin/sessions/{session}
Response: { message }
```

#### Get All Terms
```
GET /admin/terms
Response: [{ term, current_term, current: true/false }]
```

#### Set Current Term
```
PUT /admin/terms/{term}/current
Response: { message }
```

### Payment Management

#### Get Pending Payments
```
GET /admin/payments/pending
Response: [...payments]
```

#### Verify Payment
```
POST /admin/payments/{id}/verify
Response: { message }
```

### Library Management

#### Get All Library Items
```
GET /admin/library
Response: [...library_items]
```

#### Approve Library Item
```
PUT /admin/library/{id}/approve
Response: { message }
```

#### Delete Library Item
```
DELETE /admin/library/{id}
Response: { message }
```

### Class Management

#### Get All Classes
```
GET /admin/classes
Response: [...classes]
```

#### Create Class
```
POST /admin/classes
Body: { class: "JSS1", class_teacher: "Mr. John" }
Response: { message }
```

#### Update Class
```
PUT /admin/classes/{class_name}
Body: { class: "JSS1A", class_teacher: "Mr. John" }
Response: { message }
```

#### Delete Class
```
DELETE /admin/classes/{class_name}
Response: { message }
```

### Course Management

#### Get All Courses
```
GET /admin/courses
Response: [...courses]
```

#### Create Course
```
POST /admin/courses
Body: { course: "Mathematics", teacher: "Mr. Smith" }
Response: { message }
```

#### Update Course
```
PUT /admin/courses/{course_name}
Body: { course: "Advanced Mathematics", teacher: "Mr. Smith" }
Response: { message }
```

#### Delete Course
```
DELETE /admin/courses/{course_name}
Response: { message }
```

### Results Management

#### Get All Results (with filters)
```
GET /admin/results?session=2023/2024&term=First&class=JSS1
Response: { students, classes, sessions, current_session, current_term }
```

#### Get Student Results
```
GET /admin/results/{student_id}?session=2023/2024&term=First
Response: { student, results, attendance, session, term }
```

#### Approve Student Results
```
PUT /admin/results/{student_id}/approve
Body: { session, term }
Response: { message }
```

#### Unapprove Student Results
```
PUT /admin/results/{student_id}/unapprove
Body: { session, term }
Response: { message }
```

#### Bulk Approve Results
```
POST /admin/results/bulk-approve
Body: { student_ids: [...], session, term }
Response: { approved_count, message }
```

#### Bulk Unapprove Results
```
POST /admin/results/bulk-unapprove
Body: { student_ids: [...], session, term }
Response: { unapproved_count, message }
```

#### Update Principal Comment
```
PUT /admin/results/{student_id}/principal-comment
Body: { principal_comment, session, term }
Response: { student_id, session, term, principal_comment }
```

### School Days Management

#### Get School Days
```
GET /admin/school-days
Response: [...school_days]
```

#### Set School Days
```
POST /admin/school-days
Body: { session, term, total_days }
Response: { message }
```

#### Delete School Days
```
DELETE /admin/school-days/{session}/{term}
Response: { message }
```

### CBT Management (Admin)

#### Create Question
```
POST /admin/cbt/questions
Body: { class, course, question, option1, option2, option3, option4, answer, duration }
Response: { id }
```

#### Get Questions
```
GET /admin/cbt/questions?class=JSS1&course=Mathematics
Response: [...questions]
```

#### Delete Question
```
DELETE /admin/cbt/questions/{id}
Response: { message }
```

### Posts Management (Admin)

#### Get All Posts
```
GET /admin/posts?page=1&per_page=20
Response: { data: [...posts], meta: { total, page, per_page } }
```

#### Get Single Post
```
GET /admin/posts/{id}
Response: { post, comments, has_liked }
```

#### Create Post
```
POST /admin/posts
Body: { text, image (file) }
Content-Type: multipart/form-data
Response: { id }
```

#### Update Post
```
PUT /admin/posts/{id}
Body: { text, user, image (file) }
Content-Type: multipart/form-data
Response: { message }
```

#### Delete Post
```
DELETE /admin/posts/{id}
Response: { message }
```

#### Like Post
```
POST /admin/posts/{id}/like
Response: { liked: true/false }
```

#### Comment on Post
```
POST /admin/posts/{id}/comment
Body: { comment }
Response: { id }
```

### Messages (Admin)

#### Get Conversations
```
GET /admin/messages
Response: [{ user, last_message, last_time, unread_count }]
```

#### Get Messages with User
```
GET /admin/messages/{user_id}
Response: [...messages]
```

#### Send Message
```
POST /admin/messages
Body: { to, message }
Response: { id }
```

#### Get Unread Count
```
GET /admin/messages/unread/count
Response: { count }
```

#### Upload Attachment
```
POST /admin/messages/upload
Body: file (multipart/form-data)
Response: { filename, url, type, size }
```

#### Delete Conversation
```
DELETE /admin/messages/{user_id}
Response: { message }
```

#### Get Users (for messaging)
```
GET /admin/users?search=john
Response: [{ id, name, image, type }]
```

---

## 👨‍🏫 Staff Endpoints

**All staff endpoints require staff authentication**

### Dashboard
```
GET /staff/dashboard
Response: { user, current_session, current_term, student_count, analytics }
```

### Profile

#### Get Profile
```
GET /staff/profile
Response: { ...profile }
```

#### Update Profile
```
PUT /staff/profile
Body: { firstname, lastname, email, telephone, date_of_birth, state_of_origin, home_address }
Response: { message }
```

#### Update Profile Image
```
POST /staff/profile/image
Body: image (file)
Content-Type: multipart/form-data
Response: { image }
```

### Student Management

#### Get Students
```
GET /staff/students?class=JSS1
Response: [...students]
```

#### Get Student Details
```
GET /staff/students/{student_id}
Response: { ...student }
```

### Results Management

#### Upload Result (Single or Batch)
```
POST /staff/results
Body (Single): { student_id, course, session, term, test_score, exam_score }
Body (Batch): { course, results: [{ student_id, test_score, exam_score }] }
Response: { count, message }
```

#### Get Results
```
GET /staff/results?student_id=GKA240001&session=2023/2024&term=First&class=JSS1&course=Mathematics
Response: { results } or [...results]
```

#### Delete Result
```
DELETE /staff/results
Body: { class, course, session, term, student_ids: [...] }
Response: { count, message }
```

### Attendance Management

#### Get Attendance
```
GET /staff/attendance?student_id=GKA240001&session=2023/2024&term=First
GET /staff/attendance?class=JSS1&session=2023/2024&term=First
Response: { ...attendance } or [...attendance_records]
```

#### Update Attendance (Single or Batch)
```
POST /staff/attendance
Body (Single): { student_id, present, absent, session, term }
Body (Batch): { class, session, term, students: [{ student_id, present, absent }] }
Response: { count, message }
```

#### Add Comment
```
POST /staff/comment
Body: { student_id, comment, session, term }
Response: { message }
```

### Assignment Management

#### Create Assignment
```
POST /staff/assignments
Body: { subject, class, assignment, deadline, file (optional) }
Content-Type: multipart/form-data
Response: { id }
```

#### Get Assignments
```
GET /staff/assignments
Response: [...assignments]
```

#### Update Assignment
```
PUT /staff/assignments/{id}
Body: { subject, class, assignment, deadline, file (optional) }
Content-Type: multipart/form-data
Response: { message }
```

#### Delete Assignment
```
DELETE /staff/assignments/{id}
Response: { message }
```

### Library Management

#### Get Library Items
```
GET /staff/library
Response: [...library_items]
```

#### Upload Library Document
```
POST /staff/library
Body: { course, class, about, pdf (file) }
Content-Type: multipart/form-data
Response: { id }
```

#### Delete Library Item
```
DELETE /staff/library/{id}
Response: { message }
```

### Reference Data

#### Get Classes
```
GET /staff/classes
Response: [...classes]
```

#### Get Courses
```
GET /staff/courses
Response: [...courses]
```

#### Get School Days
```
GET /staff/school-days
Response: [...school_days]
```

### CBT Management (Staff)

#### Get Staff Exams
```
GET /staff/cbt
Response: [{ class, course, duration }]
```

#### Create Question
```
POST /staff/cbt/questions
Body: { class, course, question, option1, option2, option3, option4, answer, duration }
Response: { id }
```

#### Get Questions
```
GET /staff/cbt/questions?class=JSS1&course=Mathematics
Response: [...questions]
```

#### Delete Question
```
DELETE /staff/cbt/questions/{id}
Response: { message }
```

#### Get Exam Results
```
GET /staff/cbt/results?class=JSS1&course=Mathematics
Response: [...results]
```

#### Extract Questions from File
```
POST /staff/cbt/extract-questions
Body: file (PDF/DOCX)
Content-Type: multipart/form-data
Response: [...extracted_questions]
```

#### Bulk Create Questions
```
POST /staff/cbt/bulk-create
Body: { class, course, duration, data: [{ question, option1, option2, option3, option4, answer }] }
Response: { message }
```

### Posts (Staff)

#### Get All Posts
```
GET /staff/posts?page=1&per_page=20
Response: { data: [...posts], meta }
```

#### Get Single Post
```
GET /staff/posts/{id}
Response: { post, comments, has_liked }
```

#### Like Post
```
POST /staff/posts/{id}/like
Response: { liked: true/false }
```

#### Comment on Post
```
POST /staff/posts/{id}/comment
Body: { comment }
Response: { id }
```

### Messages (Staff)

#### Get Conversations
```
GET /staff/messages
Response: [{ user, last_message, last_time, unread_count }]
```

#### Get Messages with User
```
GET /staff/messages/{user_id}
Response: [...messages]
```

#### Send Message
```
POST /staff/messages
Body: { to, message }
Response: { id }
```

#### Get Unread Count
```
GET /staff/messages/unread/count
Response: { count }
```

#### Upload Attachment
```
POST /staff/messages/upload
Body: file (multipart/form-data)
Response: { filename, url, type, size }
```

#### Delete Conversation
```
DELETE /staff/messages/{user_id}
Response: { message }
```

#### Get Users
```
GET /staff/users?search=john
Response: [{ id, name, image, type }]
```

---

## 👨‍🎓 Student Endpoints

**All student endpoints require student authentication**

### Dashboard
```
GET /student/dashboard
Response: { user, current_session, current_term, unread_notifications, recent_assignments }
```

### Profile

#### Get Profile
```
GET /student/profile
Response: { ...profile }
```

#### Update Profile
```
PUT /student/profile
Body: { firstname, lastname, email, telephone, date_of_birth, state_of_origin, home_address, father_name, mother_name, gender }
Response: { message }
```

#### Update Profile Image
```
POST /student/profile/image
Body: image (file)
Content-Type: multipart/form-data
Response: { image }
```

### Academic

#### Get Results (Only if Approved)
```
GET /student/results?session=2023/2024&term=First
Response: { results, attendance, class_size, approved, session, term, teacher, principal, student }
```

#### Get Assignments
```
GET /student/assignments
Response: [...assignments]
```

#### Get Library
```
GET /student/library
Response: [...library_items]
```

#### Get Class Timetable
```
GET /student/timetable/class
Response: [...timetable]
```

#### Get Exam Timetable
```
GET /student/timetable/exam
Response: [...exam_timetable]
```

### Notifications

#### Get Notifications
```
GET /student/notifications
Response: [...notifications]
```

#### Mark Notifications as Read
```
POST /student/notifications/read
Response: { message }
```

### Payments

#### Get Payment History
```
GET /student/payments
Response: [...payments]
```

#### Initialize Payment
```
POST /student/payments/initialize
Body: { type, amount }
Response: { message, amount, type }
```

#### Get Scratch Cards
```
GET /student/scratch-cards
Response: [...scratch_cards]
```

#### Submit Scratch Card Payment
```
POST /student/scratch-cards
Body: { session, term, amount, transfer_date }
Response: { id, message }
```

### CBT (Computer-Based Testing)

#### Get Available Tests
```
GET /student/cbt/tests
Response: [{ course, duration, completed, in_progress, remaining_time }]
```

#### Start Test
```
GET /student/cbt/start/{course}
Response: { course, questions, total_questions, duration, remaining_time }
```

#### Submit Answer
```
POST /student/cbt/answer
Body: { cbt_id, answer, course }
Response: { message }
```

#### Submit Test
```
POST /student/cbt/submit
Body: { course }
Response: { score }
```

#### Get CBT Results
```
GET /student/cbt/results
Response: [...results]
```

### Book Game (AI-Powered Study Tool)

#### Upload Document
```
POST /student/bookgame/upload
Body: document (PDF/DOCX/TXT file)
Content-Type: multipart/form-data
Response: { filename, text_length, text_preview, document_text }
```

#### Generate Questions from Document
```
POST /student/bookgame/generate
Body: { document_text, num_questions }
Response: { questions: [{ id, question, options, correct_answer, explanation }], total }
```

#### Check Answer
```
POST /student/bookgame/check
Body: { question, user_answer, correct_answer, options, explanation, document_context }
Response: { correct, message, explanation, tip, your_answer, correct_answer }
```

### Posts (Student)

#### Get All Posts
```
GET /student/posts?page=1&per_page=20
Response: { data: [...posts], meta }
```

#### Get Single Post
```
GET /student/posts/{id}
Response: { post, comments, has_liked }
```

#### Like Post
```
POST /student/posts/{id}/like
Response: { liked: true/false }
```

#### Comment on Post
```
POST /student/posts/{id}/comment
Body: { comment }
Response: { id }
```

### Messages (Student)

#### Get Conversations
```
GET /student/messages
Response: [{ user, last_message, last_time, unread_count }]
```

#### Get Messages with User
```
GET /student/messages/{user_id}
Response: [...messages]
```

#### Send Message
```
POST /student/messages
Body: { to, message }
Response: { id }
```

#### Get Unread Count
```
GET /student/messages/unread/count
Response: { count }
```

#### Upload Attachment
```
POST /student/messages/upload
Body: file (multipart/form-data)
Response: { filename, url, type, size }
```

#### Delete Conversation
```
DELETE /student/messages/{user_id}
Response: { message }
```

#### Get Users
```
GET /student/users?search=john
Response: [{ id, name, image, type }]
```

---

## 🌐 Public Endpoints

**No authentication required**

### Health Check
```
GET /health
Response: { status: "ok", timestamp }
```

### Get Current Period
```
GET /public/current-period
Response: { session, term }
```

### Get All Sessions
```
GET /public/sessions
Response: [...sessions]
```

### Get All Terms
```
GET /public/terms
Response: [...terms]
```

### Get All Classes
```
GET /public/classes
Response: [...classes]
```

### Get All Courses
```
GET /public/courses
Response: [...courses]
```

### Get Public Posts
```
GET /public/posts
Response: [...posts] (limited to 20)
```

### Search Students
```
GET /public/students/search?q=john
Response: [{ student_id, firstname, lastname, class }]
```

---

## 📝 Response Format

All endpoints return JSON in this format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

**Paginated:**
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "per_page": 20,
    "last_page": 5
  }
}
```

---

## 🔑 Authentication

Include JWT token in request headers:

```
Authorization: Bearer {your_jwt_token}
```

Or:

```
X-Auth-Token: {your_jwt_token}
```

---

## 📊 Total Endpoints: **150+**

- **Authentication:** 6 endpoints
- **Admin:** 70+ endpoints
- **Staff:** 40+ endpoints
- **Student:** 30+ endpoints
- **Public:** 8 endpoints

---

**Last Updated:** 2024
