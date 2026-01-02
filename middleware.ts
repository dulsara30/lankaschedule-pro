import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET
  });

  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = ['/', '/api/auth'];
  
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  const isDashboardRoute = pathname.startsWith('/dashboard');
  const isStaffRoute = pathname.startsWith('/staff');

  // Allow public paths
  if (isPublicPath) {
    // If user is already authenticated, redirect to appropriate dashboard
    if (token && pathname === '/') {
      if (token.role === 'admin') {
        // Check if schoolId is null - redirect to setup if needed
        if (!token.schoolId) {
          return NextResponse.redirect(new URL('/dashboard/setup-school', request.url));
        }
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      if (token.role === 'teacher') {
        return NextResponse.redirect(new URL('/staff/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  // Protect dashboard routes (admin only)
  if (isDashboardRoute) {
    if (!token) {
      return NextResponse.redirect(new URL('/?error=unauthorized', request.url));
    }
    
    if (token.role !== 'admin') {
      return NextResponse.redirect(new URL('/?error=forbidden', request.url));
    }

    // Allow setup-school without schoolId check
    if (pathname === '/dashboard/setup-school') {
      return NextResponse.next();
    }

    // For all other dashboard routes, require schoolId
    if (!token.schoolId) {
      return NextResponse.redirect(new URL('/dashboard/setup-school', request.url));
    }
    
    return NextResponse.next();
  }

  // Protect staff routes (teacher only)
  if (isStaffRoute) {
    if (!token) {
      return NextResponse.redirect(new URL('/?error=unauthorized', request.url));
    }
    
    if (token.role !== 'teacher') {
      return NextResponse.redirect(new URL('/?error=forbidden', request.url));
    }

    // Teachers must have a schoolId
    if (!token.schoolId) {
      return NextResponse.redirect(new URL('/?error=no-school', request.url));
    }
    
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
};
