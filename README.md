# CU_PLUS_WEBAPP_BACKEND

Node.js + Express + Prisma service that powers CU_PLUS_WEBAPP. It exposes authentication endpoints today and is structured so new APIs can be layered on with minimal friction.

## Table of Contents
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [PostgreSQL Setup](#postgresql-setup)
  - [macOS](#macos)
  - [Windows](#windows)
- [Running the Backend](#running-the-backend)
- [Adding New APIs](#adding-new-apis)
- [Sample Requests](#sample-requests)
- [Troubleshooting](#troubleshooting)

## Tech Stack

- Node.js 20+
- Express.js
- Prisma ORM + PostgreSQL
- Nodemon (local development)

## Folder Structure

```
CU_PLUS_WEBAPP_BACKEND/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── index.js
│   ├── prisma.js
│   ├── swagger.js
│   ├── cloudinary.js        # Cloudinary config (image uploads)
│   ├── middleware/
│   │   └── auth.js
│   └── features/
│       ├── auth/
│       │   └── auth.routes.js
│       ├── manageStudent/
│       │   └── admin.students.routes.js
│       ├── announcements/
│       │   ├── admin.announcements.routes.js
│       │   └── student.announcements.route.js
│       └── forms/
│           ├── admin.forms.routes.js
│           └── student.forms.routes.js
├── .env
├── package.json
└── README.md
```

## Prerequisites

- **Node.js & npm** — download from [nodejs.org](https://nodejs.org/) or use a version manager (nvm, fnm, volta).
- **PostgreSQL 15+** — install locally (instructions below).
- **curl or an API client** (Postman, Insomnia) for manual testing.

## Environment Variables

Create a `.env` file inside `CU_PLUS_WEBAPP_BACKEND/`:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/cu_plus?schema=public"
PORT=4000
```

### Additional Environment Variables (Auth)

JWT_SECRET="your_jwt_secret_here"
SESSION_EXPIRES_IN_DAYS=7

Replace `USER`/`PASSWORD` with your local Postgres credentials (`whoami` on macOS, `postgres` or your custom user on Windows). The schema portion (`?schema=public`) should match `schema.prisma`.

### Cloudinary (for image uploads)

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

Used for storing uploaded assets such as student signatures.

## Installation

```bash
cd CU_PLUS_WEBAPP_BACKEND
npm install
npx prisma generate
```

`prisma generate` ensures the Prisma client is in sync with `schema.prisma`.

## PostgreSQL Setup

### macOS

1. Install PostgreSQL via Homebrew:

   ```bash
   brew install postgresql@17
   brew services start postgresql@17
   psql --version
   ```

2. If `psql` is not found on Apple Silicon, add the binary path:

   ```bash
   echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. Create the database:

   ```bash
   createdb cu_plus
   psql -l
   ```

### Windows

1. Install PostgreSQL:
   - **Installer** — download from the PostgreSQL website, run it, and remember the password for the `postgres` user.
   - **Chocolatey** (PowerShell as Administrator):

     ```powershell
     choco install postgresql
     ```

2. Confirm Postgres is on your PATH:

   ```powershell
   psql --version
   ```

   If the command is not recognized, add the Postgres `bin` directory (e.g., `C:\Program Files\PostgreSQL\17\bin`) to your **Path** via *Start → "Edit the system environment variables" → Environment Variables → Path → New*. Restart PowerShell afterward.

3. Create the database:

   ```powershell
   createdb cu_plus
   psql -l
   ```

   If `createdb` is missing, run `psql` and execute:

   ```sql
   CREATE DATABASE cu_plus;
   \l
   ```

## Running the Backend

```bash
# Run database migrations (creates tables defined in schema.prisma)
npx prisma migrate dev --name init

# (Optional but recommended) Reset DB during development
npx prisma migrate reset

# Seed data or open Prisma Studio (optional)
npx prisma studio

# Start the dev server with nodemon
npm run dev
```

The server defaults to `http://localhost:4000`. Adjust `PORT` in `.env` if you prefer another port.

## Adding New APIs

1. **Create a route file** in `src/api/`, e.g., `profile.routes.js`.
2. **Bootstrap the router**:

   ```js
   const express = require('express');
   const prisma = require('./prisma');
   const router = express.Router();

   router.get('/', async (req, res, next) => {
     try {
       const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
       res.json(profile);
     } catch (err) {
       next(err); // let the global error handler format the response
     }
   });

   module.exports = router;
   ```

3. **Register the route** in `src/index.js`:

   ```js
   const profileRoutes = require('./profile.routes');
   app.use('/profile', profileRoutes);
   ```

4. **Update Prisma schema** (`prisma/schema.prisma`) if the API needs new tables or relations. Run `npx prisma migrate dev` afterward.
5. **Document the endpoint** (README or inline comments) and add tests or manual steps so others can validate it quickly.


## Authentication & Authorization

This backend uses **JWT + database-backed sessions**.

### Flow
1. User logs in via `/auth/login`
2. Server:
   - Validates credentials
   - Generates JWT
   - Stores a session in DB
3. Client stores JWT (localStorage or cookie)
4. Token is sent in requests:
   ```
   Authorization: Bearer <token>
   ```

### Middleware

- `requireAuth` → verifies token + session
- `requireAdmin` → ensures user role is `admin`

Example:
```js
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  // protected route
});
```

## Announcements API

### Admin (Protected)
- `GET /admin/announcements` → fetch all announcements
- `POST /admin/announcements` → create announcement
- `DELETE /admin/announcements/:id` → delete announcement

Requires:
- `requireAuth`
- `requireAdmin`

### Student Feed (Protected)
- `GET /student/announcements/my-feed`

Returns:
- announcements where:
  - `everyone = true`
  - OR matches student's year (firstYear, secondYear, etc.)

Example:
```bash
curl http://localhost:4000/student/announcements/my-feed \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Forms API

### Student (Protected)

- `GET /student/forms`
  - Get list of available forms

- `GET /student/forms/:id`
  - Get form details + student's submission (if exists)

- `POST /student/forms/:id/submissions`
  - Submit form answers
  - Prevents resubmission if already submitted

- `POST /student/forms/signature`
  - Upload signature image (Cloudinary)
  - Body:
    ```json
    {
      "dataUrl": "data:image/png;base64,..."
    }
    ```
  - Returns:
    ```json
    {
      "url": "https://res.cloudinary.com/..."
    }
    ```

### Form Submission Behavior

- Each student can only submit once per form
- Subsequent submissions are blocked unless status is `draft`
- Submission includes:
  - text answers
  - checkbox selections (comma-separated)
  - date values
  - signature (stored as Cloudinary URL)

---

## Sample Requests

Use curl/Git Bash (macOS, Linux, Windows with Git Bash):

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@student.edu","password":"password123","name":"Test Student"}'
```

PowerShell alternative:

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:4000/auth/register `
  -ContentType 'application/json' `
  -Body '{"email":"test@student.edu","password":"password123","name":"Test Student"}'
```

### Admin Create Student (Protected)

```bash
curl -X POST http://localhost:4000/admin/students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "firstName":"John",
    "lastName":"Doe",
    "email":"john@school.edu",
    "password":"password123",
    "schoolId":"2026001",
    "year":"1"
  }'
```

## API Documentation (Swagger)

Swagger UI is available at:

http://localhost:4000/api-docs

Use it to:
- Explore all endpoints
- Test APIs directly
- View request/response schemas

Note:
- Protected routes require Authorization header:
  Authorization: Bearer <token>

---

## Troubleshooting

- **`psql`/`createdb` not found**: ensure the PostgreSQL `bin` directory is on your PATH (see platform-specific notes above).
- **Prisma complains about migrations**: run `npx prisma migrate reset` (destroys local data) or delete the dev database and rerun `npx prisma migrate dev`.
- **Port already in use**: set a new `PORT` in `.env` and restart `npm run dev`.
- **Connection refused**: verify PostgreSQL is running (`brew services list` on macOS or `services.msc` on Windows) and that the credentials in `.env` match your local setup.

- **Failed to fetch / localhost issues**:
  - Ensure backend is running on port 4000
  - Check frontend base URL is correct
  - Avoid duplicate URLs like: http://localhost:4000http://localhost:4000/...

- **Unauthorized (401)**:
  - Make sure token is sent in Authorization header
  - Verify session exists and is not expired

- **Admin routes blocked**:
  - Ensure user role is `admin`

- **TypeError: argument handler must be a function**:
  - Ensure all route files export router:
    ```js
    module.exports = router;
    ```
  - Ensure route paths start with `/` in `app.use()`:
    ```js
    app.use('/student/announcements', routes);
    ```
