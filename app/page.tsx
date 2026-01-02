'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const error = searchParams.get('error');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Invalid credentials');
        setIsLoading(false);
        return;
      }

      toast.success('Welcome back');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 relative">
              <Image
                src="/logo.png"
                alt="EduFlow AI"
                width={80}
                height={80}
                className="object-contain"
                priority
              />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-black">
              EduFlow AI
            </h1>
            <p className="text-sm text-zinc-600 mt-2 font-medium">
              School Timetable Management System
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Card className="border-black bg-zinc-50">
            <CardContent className="pt-6">
              <p className="text-sm text-black font-medium">
                {error === 'unauthorized' && 'Please sign in to continue'}
                {error === 'forbidden' && 'Access denied'}
                {error !== 'unauthorized' && error !== 'forbidden' && 'An error occurred'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Login Card */}
        <Card className="border-2 border-black shadow-none">
          <CardHeader className="space-y-1 border-b-2 border-black pb-6">
            <CardTitle className="text-2xl font-bold text-black">
              Administrator Login
            </CardTitle>
            <CardDescription className="text-zinc-600">
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-bold text-black uppercase tracking-wide">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="border-2 border-black focus:ring-0 focus:border-black rounded-none h-11 bg-white"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-bold text-black uppercase tracking-wide">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="border-2 border-black focus:ring-0 focus:border-black rounded-none h-11 bg-white"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-black hover:bg-zinc-800 text-white font-bold uppercase tracking-wide rounded-none border-2 border-black transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-zinc-500 font-medium">
            © 2026 EduFlow AI. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
