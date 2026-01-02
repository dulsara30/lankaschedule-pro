# EduFlow AI - Authentication System

## Overview

This document describes the dual-role authentication system implemented with NextAuth.js.

## Authentication Providers

### 1. Admin Authentication

- **Provider ID**: `admin`
- **Method**: Email + Password
- **Default Credentials**:
  - Email: `admin@eduflow.ai`
  - Password: `admin123`
- **Environment Variables**:
  - `ADMIN_EMAIL` (optional override)
  - `ADMIN_PASSWORD` (optional override)
- **Session Data**:
  - `role`: 'admin'
  - `schoolId`: From database
  - `email`: Admin email

### 2. Teacher Authentication

- **Provider ID**: `teacher`
- **Method**: Passwordless (Email or Phone)
- **How it works**:
  - Teacher enters email OR phone number
  - System checks Teacher model in database
  - Automatically detects format (email has '@', phone doesn't)
  - Logs in if teacher found
- **Session Data**:
  - `role`: 'teacher'
  - `teacherId`: Teacher's MongoDB ObjectId
  - `schoolId`: Teacher's school
  - `name`: Teacher's full name
  - `email`: Teacher's email (if available)

## Route Protection

### Middleware Configuration

The middleware enforces role-based access control:

#### Protected Routes:

1. **Admin Routes** (`/dashboard/*`)

   - Requires: `role === 'admin'`
   - Unauthorized: Redirects to `/?error=unauthorized`
   - Wrong role: Redirects to `/?error=forbidden`

2. **Teacher Routes** (`/staff/*`)
   - Requires: `role === 'teacher'`
   - Unauthorized: Redirects to `/?error=unauthorized`
   - Wrong role: Redirects to `/?error=forbidden`

#### Public Routes:

- `/` (Landing page)
- `/api/auth/*` (NextAuth endpoints)
- `/_next/static/*` (Static assets)
- `/_next/image/*` (Image optimization)
- `/favicon.ico`, `/logo.png`

## Landing Page

### Features

- **Dual-Tab Interface**: Admin Login | Staff Access
- **Admin Tab**:
  - Email input
  - Password input
  - "Sign In as Admin" button
  - Redirects to `/dashboard` on success
- **Staff Tab**:
  - Single identifier input (email or phone)
  - Helper text explaining format
  - "Access Staff Portal" button (purple)
  - Redirects to `/staff/dashboard` on success

### Error Handling

- Invalid admin credentials: "Invalid admin credentials" toast
- Teacher not found: "No teacher found with that email or phone" toast
- Unauthorized access: Alert banner with message
- Forbidden access: Alert banner for wrong role

## Session Management

### JWT Configuration

- **Strategy**: JWT (JSON Web Tokens)
- **Max Age**: 30 days
- **Secret**: `NEXTAUTH_SECRET` environment variable
- **Custom Claims**:
  - `id`: User's unique identifier
  - `role`: 'admin' or 'teacher'
  - `schoolId`: Associated school ID
  - `teacherId`: (Teachers only) Teacher's ID
  - `email`: User's email
  - `name`: User's display name

### Session Access

```typescript
import { useSession } from "next-auth/react";

function Component() {
  const { data: session, status } = useSession();

  // session.user.role === 'admin' | 'teacher'
  // session.user.email
  // session.user.name
  // session.user.schoolId
  // session.user.teacherId (teachers only)
}
```

### Server-Side Session

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Use session.user.role, session.user.schoolId, etc.
}
```

## Testing Guide

### Test Admin Login

1. Navigate to http://localhost:3000
2. Click "Admin Login" tab
3. Enter:
   - Email: `admin@eduflow.ai`
   - Password: `admin123`
4. Click "Sign In as Admin"
5. Should redirect to `/dashboard`

### Test Teacher Login

**Prerequisites**: You need a teacher in the database with either email or phone.

1. Navigate to http://localhost:3000
2. Click "Staff Access" tab
3. Enter teacher's email (e.g., `teacher@school.lk`) OR phone (e.g., `0771234567`)
4. Click "Access Staff Portal"
5. Should redirect to `/staff/dashboard`

### Test Middleware Protection

1. **Logged in as Admin**:

   - Visit `/dashboard` → ✅ Allowed
   - Visit `/staff/dashboard` → ❌ Redirected to `/?error=forbidden`

2. **Logged in as Teacher**:

   - Visit `/staff/dashboard` → ✅ Allowed
   - Visit `/dashboard` → ❌ Redirected to `/?error=forbidden`

3. **Not Logged In**:
   - Visit `/dashboard` → ❌ Redirected to `/?error=unauthorized`
   - Visit `/staff/dashboard` → ❌ Redirected to `/?error=unauthorized`

### Test Logout

1. Click "Sign Out" button in header (admin or staff dashboard)
2. Should redirect to landing page
3. Session cleared

## Environment Variables

### Required

```env
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
MONGODB_URI=your-mongodb-connection-string
```

### Optional (Admin Overrides)

```env
ADMIN_EMAIL=admin@eduflow.ai
ADMIN_PASSWORD=admin123
```

## File Structure

```
app/
├── api/
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts          # NextAuth configuration
├── dashboard/                    # Admin area (protected)
├── staff/
│   └── dashboard/
│       └── page.tsx              # Teacher portal
├── layout.tsx                    # Root layout with AuthProvider
├── page.tsx                      # Landing page with dual login
└── middleware.ts                 # Route protection

components/
└── providers/
    └── AuthProvider.tsx          # SessionProvider wrapper

models/
└── Teacher.ts                    # Updated with phoneNumber field
```

## Security Notes

1. **Admin Credentials**: Currently hardcoded for development. In production:

   - Store hashed passwords in database
   - Use environment variables
   - Implement proper user management

2. **Teacher Passwordless**: Current implementation is for development:

   - In production, add OTP/magic link verification
   - Send verification codes via SMS/email
   - Implement rate limiting

3. **JWT Secret**:

   - Never commit `NEXTAUTH_SECRET` to version control
   - Use strong random strings (32+ characters)
   - Rotate periodically in production

4. **HTTPS**:
   - Always use HTTPS in production
   - Set `NEXTAUTH_URL` to `https://` domain
   - Enable secure cookies

## Next Steps

### For Production

1. Implement OTP verification for teachers
2. Add password hashing for admin accounts
3. Store admin credentials in database
4. Add email/SMS notification system
5. Implement rate limiting on auth endpoints
6. Add audit logging for logins
7. Set up HTTPS and secure cookies
8. Add password reset functionality
9. Implement session expiration warnings
10. Add two-factor authentication option

### For Teacher Portal

1. Create timetable viewing interface
2. Add free period calculator
3. Show class assignments
4. Enable clash notifications
5. Add personal schedule management
6. Implement feedback system

## Troubleshooting

### "Invalid credentials" error

- Check ADMIN_EMAIL and ADMIN_PASSWORD in .env.local
- Verify Teacher exists in database with correct email/phone

### "Unauthorized" error

- Check NEXTAUTH_SECRET is set
- Verify JWT token is being generated
- Check browser cookies are enabled

### Middleware not working

- Ensure middleware.ts is at root level
- Check matcher configuration
- Verify getToken() is using correct secret

### Session not persisting

- Check NEXTAUTH_URL matches your domain
- Verify cookies are allowed in browser
- Check maxAge in session configuration

## Support

For issues or questions, check:

- NextAuth.js docs: https://next-auth.js.org/
- Middleware guide: https://nextjs.org/docs/app/building-your-application/routing/middleware
- MongoDB Mongoose: https://mongoosejs.com/
