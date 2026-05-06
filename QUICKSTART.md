# 🚀 Quick Start Guide

## Step 1: Install Node.js

If you don't have Node.js installed:
1. Download from https://nodejs.org/ (LTS version recommended)
2. Install and verify:
   ```bash
   node --version
   npm --version
   ```

## Step 2: Install Dependencies

Open terminal/command prompt in the `nestjs-backend` folder and run:

```bash
npm install
```

This will install all required packages (may take 2-3 minutes).

## Step 3: Configure Database

The `.env` file is already configured for localhost. If needed, edit it:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=greakings
DB_USER=root
DB_PASS=
```

**Note:** Uses the same MySQL database as your PHP backend!

## Step 4: Run the Server

Start in development mode (with auto-reload):

```bash
npm run start:dev
```

You should see:
```
🚀 Florieren API running on http://localhost:3000
```

## Step 5: Test the API

Open your browser or Postman and test:

**Health Check:**
```
GET http://localhost:3000/health
```

**Login (Student):**
```
POST http://localhost:3000/auth/student/login
Content-Type: application/json

{
  "name": "GKA240001",
  "password": "your-password"
}
```

**Get Current User (with token):**
```
GET http://localhost:3000/auth/me
Authorization: Bearer YOUR_TOKEN_HERE
```

## Common Issues

### Port 3000 already in use
Change the port in `.env`:
```env
PORT=3001
```

### Database connection error
- Make sure MySQL is running
- Check database credentials in `.env`
- Verify database name exists

### Module not found errors
Run `npm install` again

## Production Build

To build for production:

```bash
npm run build
npm run start:prod
```

## Stopping the Server

Press `Ctrl + C` in the terminal

## Next Steps

- Update frontend API URLs to `http://localhost:3000`
- Test all endpoints with your frontend
- Configure OpenAI API key for bookgame feature
- Deploy to production server when ready

## API Documentation

See `README.md` for complete API endpoint list.

---

**Need Help?** Check the logs in the terminal for error messages.
