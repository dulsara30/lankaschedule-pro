import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import dbConnect from '@/lib/dbConnect';
import UserModel from '@/models/User';
import Teacher from '@/models/Teacher';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: 'admin' | 'teacher';
      schoolId: string | null;
      phoneNumber?: string | null;
    };
  }

  interface User {
    id: string;
    email?: string | null;
    name?: string | null;
    role: 'admin' | 'teacher';
    schoolId: string | null;
    phoneNumber?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'admin' | 'teacher';
    schoolId: string | null;
    phoneNumber?: string | null;
  }
}

const authOptions: NextAuthOptions = {
  providers: [
    // Admin Login Provider
    CredentialsProvider({
      id: 'credentials',
      name: 'Admin Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        try {
          await dbConnect();

          const user = await UserModel.findOne({ email: credentials.email.toLowerCase() });
          
          if (!user) {
            throw new Error('Invalid credentials');
          }

          const isPasswordValid = await user.comparePassword(credentials.password);
          
          if (!isPasswordValid) {
            throw new Error('Invalid credentials');
          }

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: 'admin' as const,
            schoolId: user.schoolId ? user.schoolId.toString() : null,
          };
        } catch (error) {
          console.error('Auth error:', error);
          throw new Error(error instanceof Error ? error.message : 'Authentication failed');
        }
      },
    }),
    // Staff Login Provider
    CredentialsProvider({
      id: 'staff-credentials',
      name: 'Staff Access',
      credentials: {
        identifier: { label: 'Email or Phone', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.identifier) {
          throw new Error('Email or phone number required');
        }

        try {
          await dbConnect();

          // Check if identifier is email or phone
          const isEmail = credentials.identifier.includes('@');
          
          const query = isEmail
            ? { email: credentials.identifier.toLowerCase() }
            : { phoneNumber: credentials.identifier };

          const teacher = await Teacher.findOne(query);
          
          if (!teacher) {
            throw new Error('No teacher found with that email or phone');
          }

          return {
            id: teacher._id.toString(),
            email: teacher.email,
            name: teacher.name,
            role: 'teacher' as const,
            schoolId: teacher.schoolId ? teacher.schoolId.toString() : null,
            phoneNumber: teacher.phoneNumber,
          };
        } catch (error) {
          console.error('Staff auth error:', error);
          throw new Error(error instanceof Error ? error.message : 'Authentication failed');
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.schoolId = user.schoolId;
        token.phoneNumber = user.phoneNumber;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.schoolId = token.schoolId;
        session.user.phoneNumber = token.phoneNumber;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST, authOptions };
