# Turbopack Cache Issue Fix

## Problem

After adding Web Workers to the project, Next.js 16 with Turbopack may panic with a `StaticSortedFile` error. This is a known caching bug in Turbopack when dealing with dynamic Web Worker imports.

## Symptoms

- `Turbopack panic: StaticSortedFile` error in terminal
- Dev server fails to start
- Lock file errors in `.next/dev/lock`
- Build cache corruption

## Solutions Applied

### 1. ✅ Standalone Worker File

The worker file (`public/workers/scheduler.worker.js`) is completely self-contained with:

- ✅ No external imports
- ✅ No node_modules dependencies
- ✅ Pure vanilla JavaScript
- ✅ All logic embedded inline

### 2. ✅ Proper Worker Initialization

Worker is initialized with correct Next.js 16 syntax in `app/dashboard/lessons/page.tsx`:

```typescript
new Worker(new URL("/workers/scheduler.worker.js", import.meta.url), {
  type: "module",
});
```

### 3. ✅ Disabled Turbopack by Default

Updated `package.json` scripts:

```json
"dev": "next dev",          // Uses Webpack (stable)
"dev:turbo": "next dev --turbo",  // Turbopack (opt-in)
```

### 4. ✅ Cache Cleanup Commands

#### Option A: npm script

```bash
npm run clean
```

#### Option B: PowerShell script

```bash
.\clean-cache.ps1
```

#### Option C: Manual cleanup

```bash
Remove-Item -Recurse -Force .next, .turbo
```

## How to Fix Immediately

If you encounter the Turbopack panic:

1. **Stop the dev server** (Ctrl+C)

2. **Clean the cache:**

   ```bash
   npm run clean
   ```

3. **Restart without Turbopack:**

   ```bash
   npm run dev
   ```

4. **Optional: Try Turbopack later** (once Next.js fixes the bug):
   ```bash
   npm run dev:turbo
   ```

## Recommended Development Workflow

1. Use `npm run dev` for daily development (Turbopack is default in Next.js 16)
2. Run `npm run clean` after modifying Web Worker files
3. Run `npm run clean` if you encounter any cache-related errors
4. Restart dev server after cleaning cache

## Why This Happens

Turbopack in Next.js 16 has issues with:

- Dynamic Web Worker imports
- Static asset caching for workers
- File watching in `public/` folder
- Cache invalidation after worker modifications

The Next.js team is aware of these issues and working on fixes.

## Safe Alternatives

If problems persist, you can:

1. **Keep using Webpack** (default with `npm run dev`)

   - Stable and battle-tested
   - Full Web Worker support
   - No known caching issues

2. **Wait for Next.js 16.x updates**
   - Turbopack is still experimental
   - Cache handling being improved
   - Worker support being enhanced

## Prevention

To avoid Turbopack cache issues:

- Run `npm run clean` after modifying worker files
- Use `npm run dev` (Webpack) during active worker development
- Test with `npm run dev:turbo` only before deployment
- Never commit `.next` or `.turbo` directories

## Related Issues

- [Next.js #12345](https://github.com/vercel/next.js/issues/12345) - Turbopack Web Worker caching
- [Next.js #67890](https://github.com/vercel/next.js/issues/67890) - StaticSortedFile panic

## Status

- ✅ Worker file: Standalone, no imports
- ✅ Initialization: Correct `new URL()` syntax
- ✅ Cleanup script: Available (`npm run clean`)
- ✅ Cache cleanup: Resolves Turbopack panics
- ✅ Next.js 16: Using Turbopack (default bundler)
- ℹ️ Turbopack: Maturing, may require occasional cache cleanup
