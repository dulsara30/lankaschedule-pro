# LankaSchedule Pro - Vercel Deployment Guide

## ✅ Build Status

**Project is ready for Vercel deployment** - All TypeScript errors resolved!

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB database (Atlas recommended)
- Python 3.8+ for solver service

### Environment Variables

Create `.env.local`:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/lankaschedule
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
SOLVER_API_URL=https://your-python-solver.railway.app
NODE_ENV=production
```

## Vercel Deployment

1. **Push to GitHub**

```bash
git push origin main
```

2. **Import to Vercel**

   - Go to vercel.com → New Project
   - Import your GitHub repo
   - Framework: Next.js (auto-detected)

3. **Configure Environment Variables**

   - Add all variables from `.env.local`
   - Set `NEXTAUTH_URL` to your Vercel URL

4. **Deploy** 🚀

## Python Solver Deployment

Deploy `solver.py` separately on:

- **Railway.app** (recommended, free tier)
- **Render.com** (free tier)
- **Google Cloud Run**

Update `SOLVER_API_URL` after deployment.

## MongoDB Atlas

1. Create free cluster at mongodb.com/cloud/atlas
2. Whitelist Vercel IPs or `0.0.0.0/0`
3. Get connection string → `MONGODB_URI`

## Build Verification

```bash
npm run build  # Should complete without errors
npm start      # Test production build
```

Expected output:

```
✓ Compiled successfully
✓ Finished TypeScript
✓ Collecting page data (33/33)
✓ Generating static pages
```

## Troubleshooting

**Build fails**: Check environment variables
**Solver not connecting**: Verify `SOLVER_API_URL`
**DB errors**: Check MongoDB Atlas IP whitelist

## Cost Estimate

- Vercel: Free tier
- MongoDB Atlas: Free (512MB)
- Python Solver: $5-10/month

---

✅ **Ready to deploy!** The build is clean and all systems are configured.
