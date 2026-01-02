# 🚀 EduFlow AI - Deployment Guide

## Pre-Deployment Checklist

✅ All security vulnerabilities patched  
✅ Production build passing  
✅ TypeScript strict mode enabled  
✅ Multi-tenancy verified

---

## 1. Generate NEXTAUTH_SECRET

```bash
# Run this command to generate a secure 32-character secret
openssl rand -base64 32
```

Copy the output - you'll need it for environment variables.

---

## 2. Prepare MongoDB Atlas

### Create Database

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a new cluster (or use existing)
3. Create a database user with read/write permissions
4. Get your connection string:
   - Click "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password

### Whitelist IPs

- For Vercel: Add `0.0.0.0/0` (all IPs) or specific Vercel IPs
- For other hosts: Add your deployment server IPs

### Connection String Format

```
mongodb+srv://<username>:<password>@cluster.xxxxx.mongodb.net/<database>?retryWrites=true&w=majority
```

---

## 3. Deploy to Vercel

### Option A: GitHub Integration (Recommended)

1. Push your code to GitHub:

   ```bash
   git push origin main
   ```

2. Go to [Vercel Dashboard](https://vercel.com/dashboard)

3. Click "New Project" → Import your GitHub repository

4. Configure project:

   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
   - **Install Command:** `npm install`
   - **Node Version:** 18.x or higher

5. Add environment variables (see below)

6. Click "Deploy"

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

---

## 4. Environment Variables

### Required Variables

Add these in Vercel Dashboard → Project → Settings → Environment Variables:

```env
# Authentication Secret (CRITICAL - Generate with openssl rand -base64 32)
NEXTAUTH_SECRET=your-generated-secret-here

# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/eduflow?retryWrites=true&w=majority

# NextAuth URL (Your production domain)
NEXTAUTH_URL=https://your-domain.vercel.app
```

### Important Notes

- ⚠️ Never commit `.env.local` to Git
- ⚠️ `NEXTAUTH_SECRET` must be at least 32 characters
- ⚠️ `NEXTAUTH_URL` must match your exact domain (no trailing slash)

---

## 5. Post-Deployment Verification

### Test Admin Login

1. Go to `https://your-domain.vercel.app`
2. Switch to "Admin Login" tab
3. Enter your admin email and password
4. Should redirect to `/dashboard`

### Test Teacher Login

1. Go to login page
2. Switch to "Staff Login" tab
3. Enter teacher identifier (email or NIC)
4. Should redirect to `/staff/dashboard`

### Test Role Protection

1. Try accessing `/dashboard` as teacher → Should redirect
2. Try accessing `/staff` as admin → Should redirect

### Test Timetable Flow

1. Admin: Create classes, subjects, teachers, lessons
2. Admin: Generate timetable
3. Admin: Publish timetable
4. Teacher: View published timetable
5. Teacher: Export PDF and PNG

---

## 6. Create First Admin User

### Option A: MongoDB Compass

1. Connect to your MongoDB Atlas cluster
2. Navigate to `users` collection
3. Insert document:

```json
{
  "email": "admin@yourschool.com",
  "password": "$2a$10$your-bcrypt-hashed-password",
  "name": "School Administrator",
  "role": "admin",
  "createdAt": { "$date": "2024-12-01T00:00:00.000Z" }
}
```

**Note:** You need to hash the password with bcrypt first!

### Option B: Use createUser Script (Locally)

```bash
# Install dependencies if not already
npm install dotenv bcryptjs

# Run script
npx tsx scripts/createUser.ts
```

Follow prompts to create admin user (will sync to MongoDB Atlas).

---

## 7. Domain Configuration (Optional)

### Add Custom Domain in Vercel

1. Go to Project Settings → Domains
2. Add your custom domain (e.g., `eduflow.yourschool.com`)
3. Follow DNS configuration instructions
4. Update `NEXTAUTH_URL` environment variable
5. Redeploy (Vercel will auto-generate SSL certificate)

---

## 8. Monitoring & Maintenance

### Enable Vercel Analytics

1. Go to Project Settings → Analytics
2. Enable Web Analytics and Speed Insights
3. Monitor Core Web Vitals

### Set Up Error Tracking (Optional)

Consider integrating:

- Sentry for error monitoring
- LogRocket for session replay
- Vercel Logs for deployment debugging

### Regular Backups

- Enable MongoDB Atlas automated backups
- Schedule: Daily snapshots recommended
- Retention: 7-30 days depending on needs

---

## 9. Scaling Considerations

### Database Indexes (Recommended)

```javascript
// Add in MongoDB Atlas or via Mongoose
db.classes.createIndex({ schoolId: 1 });
db.teachers.createIndex({ schoolId: 1 });
db.subjects.createIndex({ schoolId: 1 });
db.lessons.createIndex({ schoolId: 1 });
db.timetableSlots.createIndex({ versionId: 1, schoolId: 1 });
```

### Vercel Pro Features

- Increased build minutes
- Better CDN performance
- Priority support
- Custom build cache

---

## 10. Troubleshooting

### Build Fails

```bash
# Test locally first
npm run build

# Check for TypeScript errors
npx tsc --noEmit

# Clear .next cache
rm -rf .next
npm run build
```

### Environment Variables Not Working

- Verify variable names match exactly (case-sensitive)
- Redeploy after adding variables
- Check Vercel deployment logs for missing vars

### Database Connection Issues

- Verify MongoDB Atlas IP whitelist
- Check connection string format
- Test connection locally first
- Ensure database user has correct permissions

### Authentication Errors

- Verify `NEXTAUTH_SECRET` is set and 32+ chars
- Check `NEXTAUTH_URL` matches deployment domain
- Clear browser cookies and try again

---

## 📞 Support

**Audit Report:** See `AUDIT_REPORT.md` for comprehensive system analysis  
**GitHub Issues:** Report bugs and feature requests  
**Vercel Docs:** https://vercel.com/docs  
**Next.js Docs:** https://nextjs.org/docs

---

## ✅ Deployment Complete!

Your EduFlow AI system is now live and ready for production use.

**Security:** Hardened ✓  
**Performance:** Optimized ✓  
**Multi-Tenancy:** Verified ✓  
**Build:** Passing ✓

Happy scheduling! 🎓📅
