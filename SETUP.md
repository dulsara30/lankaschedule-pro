# EduFlow AI - Setup Guide

## Database-Driven Multi-Tenant Authentication

### Quick Start

1. **Create Admin User** (if not already created):

   ```bash
   node scripts/createUserSimple.js
   ```

2. **Start Development Server**:

   ```bash
   npm run dev
   ```

3. **Login**:
   - URL: http://localhost:3000
   - Email: `admin@eduflow.ai`
   - Password: `admin123`

### First-Time Setup Flow

When you login for the first time:

1. **Login Page** - Enter your credentials
2. **Setup School** - You'll be redirected to `/dashboard/setup-school` because your user has no `schoolId` yet
3. **Configure School** - Enter:
   - School Name
   - Periods Per Day (e.g., 8)
   - Days Per Week (e.g., 5)
4. **Dashboard** - After school creation, you'll be redirected to the main dashboard

### Architecture

#### User Model

```typescript
{
  email: string; // Unique identifier
  password: string; // Bcrypt hashed
  name: string; // Display name
  schoolId: ObjectId; // Reference to School (null until setup)
  createdAt: Date;
}
```

#### Authentication Flow

1. User enters email/password
2. NextAuth verifies against User model in database
3. Password compared using bcrypt
4. JWT token created with: `id`, `role`, `schoolId`
5. Middleware checks `schoolId`:
   - **null** → redirect to `/dashboard/setup-school`
   - **exists** → allow access to dashboard

#### Middleware Protection

- `/dashboard/*` → Requires authenticated admin
- `/dashboard/setup-school` → Always accessible to authenticated users
- All other `/dashboard` routes → Requires `schoolId` to be set

### Features

#### 1. Minimalist B&W UI

- Strict black and white color scheme
- No gradients or drop shadows
- Clean borders (`border-2 border-black`)
- Professional typography
- `rounded-none` for sharp, clean edges

#### 2. Communications Center

Location: `/dashboard/communications`

- View all published timetables
- Edit admin notes for each published version
- Unpublish timetables from staff view
- Global staff announcement section (coming soon)

#### 3. Multi-Tenant Support

Each admin user can:

- Create their own school
- Manage independent timetables
- Keep data isolated per school

### API Endpoints

#### Authentication

- `POST /api/auth/callback/credentials` - Login with email/password
- `GET /api/auth/session` - Get current session

#### User Management

- `POST /api/user/update-school` - Link user to school after creation

#### School Management

- `POST /api/school` - Create new school
- `GET /api/school/config` - Get school configuration

#### Communications

- `GET /api/timetable/versions` - Get all timetable versions
- `POST /api/timetable/versions/publish` - Publish version with admin note
- `DELETE /api/timetable/versions/publish` - Unpublish version

### Environment Variables

Required in `.env.local`:

```env
# MongoDB Connection
MONGODB_URI=your_mongodb_connection_string

# NextAuth Configuration
NEXTAUTH_SECRET=your_secret_key_here
NEXTAUTH_URL=http://localhost:3000
```

### Creating Additional Users

To create more admin users, modify and run:

```javascript
// scripts/createUserSimple.js
const user = await User.create({
  email: "newadmin@school.edu",
  password: hashedPassword,
  name: "New Admin",
  schoolId: null,
});
```

### Security Notes

1. **Passwords** are hashed with bcrypt (salt rounds: 10)
2. **Sessions** use JWT with 30-day expiration
3. **Middleware** enforces route protection
4. **School Isolation** ensures multi-tenant data separation

### Troubleshooting

#### "Invalid credentials" error

- Verify user exists in database
- Check password is correct
- Run `node scripts/createUserSimple.js` to recreate user

#### Stuck on setup-school page

- Check if school was created successfully
- Verify user's `schoolId` was updated
- Check browser console for errors

#### Can't access dashboard

- Ensure you completed school setup
- Check session contains `schoolId`
- Clear cookies and login again

### Development Workflow

1. **Create User** → `node scripts/createUserSimple.js`
2. **Login** → http://localhost:3000
3. **Setup School** → Automatic redirect
4. **Configure** → Teachers, Subjects, Classes, Lessons
5. **Generate Timetable** → AI-powered scheduling
6. **Publish** → Communications Center

### Next Steps

- [ ] Implement email verification for new users
- [ ] Add password reset functionality
- [ ] Create user management dashboard
- [ ] Add role-based permissions (super admin, school admin)
- [ ] Implement global staff announcements
- [ ] Add email notifications for published timetables

### Support

For issues or questions:

- Check the [AUTHENTICATION.md](AUTHENTICATION.md) for detailed auth documentation
- Review middleware logic in `middleware.ts`
- Check NextAuth configuration in `app/api/auth/[...nextauth]/route.ts`
