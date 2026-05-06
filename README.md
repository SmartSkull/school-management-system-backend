# Florieren Backend - NestJS

Complete NestJS conversion of the PHP backend for Florieren Parklane International School.

## Features

- ✅ JWT Authentication (Student, Staff, Admin)
- ✅ Admin Dashboard & Management
- ✅ Staff Results & Attendance Management
- ✅ Student Portal (Results, Assignments, Library)
- ✅ CBT (Computer-Based Testing)
- ✅ Posts & Comments System
- ✅ Messaging System
- ✅ AI-Powered Book Game (OpenAI)
- ✅ File Uploads (Images, PDFs, Documents)

## Prerequisites

- Node.js 18+ and npm
- MySQL database (same as PHP version)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Edit `.env` file with your database credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=greakings
   DB_USER=root
   DB_PASS=
   
   JWT_SECRET=gka_jwt_secret_key_2024_secure_token
   OPENAI_API_KEY=your-openai-api-key
   ```

3. **Database:**
   Uses the same MySQL database as the PHP backend. No migration needed.

## Running the Application

### Development Mode (with auto-reload):
```bash
npm run start:dev
```

### Production Mode:
```bash
npm run build
npm run start:prod
```

The API will run on **http://localhost:3000**

## API Endpoints

### Authentication
- `POST /auth/student/login` - Student login
- `POST /auth/staff/login` - Staff login
- `POST /auth/admin/login` - Admin login
- `POST /auth/refresh` - Refresh token
- `GET /auth/me` - Get current user

### Admin Routes
- `GET /admin/dashboard` - Dashboard stats
- `GET /admin/students` - List students (with pagination, filters)
- `POST /admin/students` - Create student
- `POST /admin/students/verify` - Verify student
- `GET /admin/staff` - List staff
- `POST /admin/staff` - Create staff
- `GET /admin/results` - View all results
- `POST /admin/results/bulk-approve` - Approve multiple results
- And many more...

### Staff Routes
- `GET /staff/dashboard` - Staff dashboard
- `POST /staff/results` - Upload results (single or batch)
- `GET /staff/results` - View results
- `POST /staff/attendance` - Update attendance
- `POST /staff/assignments` - Create assignment
- `POST /staff/library` - Upload library document
- And more...

### Student Routes
- `GET /student/dashboard` - Student dashboard
- `GET /student/results` - View results (only if approved)
- `GET /student/assignments` - View assignments
- `GET /student/library` - View library
- `GET /student/cbt/tests` - Available CBT tests
- `POST /student/cbt/submit` - Submit CBT test
- `POST /student/bookgame/upload` - Upload document for AI questions
- And more...

### Public Routes
- `GET /health` - Health check
- `GET /public/sessions` - Get all sessions
- `GET /public/classes` - Get all classes
- `GET /public/posts` - Get public posts

## Project Structure

```
src/
├── admin/          # Admin module (dashboard, students, staff, results)
├── staff/          # Staff module (results, attendance, assignments)
├── student/        # Student module (results, library, CBT)
├── auth/           # Authentication (login, JWT)
├── cbt/            # Computer-Based Testing
├── posts/          # Posts & comments
├── messages/       # Messaging system
├── bookgame/       # AI-powered study tool
├── public/         # Public endpoints
├── database/       # Database service (MySQL)
├── common/         # Guards, decorators, utilities
└── main.ts         # Application entry point
```

## Key Differences from PHP

1. **TypeScript** instead of PHP
2. **Dependency Injection** - Services injected via constructor
3. **Decorators** - `@Controller()`, `@Get()`, `@UseGuards()`, etc.
4. **Guards** - JWT authentication via guards instead of middleware
5. **Async/Await** - All database operations are async
6. **Module System** - Each feature is a self-contained module

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | localhost |
| `DB_PORT` | MySQL port | 3306 |
| `DB_NAME` | Database name | greakings |
| `DB_USER` | Database user | root |
| `DB_PASS` | Database password | (empty) |
| `JWT_SECRET` | JWT secret key | gka_jwt_secret_key_2024_secure_token |
| `JWT_EXPIRY` | Token expiry | 86400 (24h) |
| `PORT` | Server port | 3000 |
| `OPENAI_API_KEY` | OpenAI API key | (required for bookgame) |

## Testing

Test endpoints using:
- **Postman** or **Insomnia**
- **curl** commands
- Frontend application

Example login:
```bash
curl -X POST http://localhost:3000/auth/student/login \
  -H "Content-Type: application/json" \
  -d '{"name":"GKA240001","password":"password123"}'
```

## Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Set environment to production in `.env`:
   ```env
   APP_ENV=production
   ```

3. Run with PM2 (recommended):
   ```bash
   npm install -g pm2
   pm2 start dist/main.js --name florieren-api
   pm2 save
   pm2 startup
   ```

## Support

For issues or questions, contact the development team.

---

**Built with NestJS** 🚀
