'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('admin');
  
  // Admin credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Staff credentials
  const [staffIdentifier, setStaffIdentifier] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  
  const error = searchParams.get('error');

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Invalid admin credentials');
        setIsLoading(false);
        return;
      }

      toast.success('Welcome back, Administrator');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An error occurred');
      setIsLoading(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn('staff-credentials', {
        identifier: staffIdentifier,
        password: staffPassword,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Invalid staff credentials');
        setIsLoading(false);
        return;
      }

      toast.success('Welcome, Teacher');
      router.push('/staff/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-4">
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
            <h1 className="text-4xl font-bold tracking-tight text-black dark:text-white">
              EduFlow AI
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
              School Timetable Management System
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Card className="border-2 border-black dark:border-white bg-white dark:bg-black">
            <CardContent className="pt-6">
              <p className="text-sm text-black dark:text-white font-medium">
                {error === 'unauthorized' && 'Please sign in to continue'}
                {error === 'forbidden' && 'Access denied'}
                {error !== 'unauthorized' && error !== 'forbidden' && 'An error occurred'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Login Card with Tabs */}
        <Card className="border-2 border-black dark:border-white shadow-none">
          <CardHeader className="space-y-4 border-b-2 border-black dark:border-white pb-6">
            <div>
              <CardTitle className="text-2xl font-bold text-black dark:text-white">
                Portal Login
              </CardTitle>
              <CardDescription className="text-zinc-600 dark:text-zinc-400 mt-1">
                Select your role and enter credentials
              </CardDescription>
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-2 bg-zinc-100 dark:bg-zinc-900 border border-black dark:border-white rounded-none p-1">
                <TabsTrigger 
                  value="admin" 
                  className="data-[state=active]:bg-black data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-black rounded-none border-none font-medium"
                >
                  Admin Login
                </TabsTrigger>
                <TabsTrigger 
                  value="staff" 
                  className="data-[state=active]:bg-black data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-black rounded-none border-none font-medium"
                >
                  Staff Access
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {/* Admin Login Form */}
              <TabsContent value="admin" className="mt-0">
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-bold text-black dark:text-white">
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
                      className="border-2 border-black dark:border-white focus:ring-0 focus:border-black dark:focus:border-white rounded-none h-11 bg-white dark:bg-black"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-bold text-black dark:text-white">
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
                      className="border-2 border-black dark:border-white focus:ring-0 focus:border-black dark:focus:border-white rounded-none h-11 bg-white dark:bg-black"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-bold rounded-none border-2 border-black dark:border-white transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      'Sign In as Admin'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Staff Login Form */}
              <TabsContent value="staff" className="mt-0">
                <form onSubmit={handleStaffLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="staffIdentifier" className="text-sm font-bold text-black dark:text-white">
                      Email or Phone Number
                    </label>
                    <Input
                      id="staffIdentifier"
                      type="text"
                      placeholder="teacher@school.edu or 0771234567"
                      value={staffIdentifier}
                      onChange={(e) => setStaffIdentifier(e.target.value)}
                      required
                      disabled={isLoading}
                      className="border-2 border-black dark:border-white focus:ring-0 focus:border-black dark:focus:border-white rounded-none h-11 bg-white dark:bg-black"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="staffPassword" className="text-sm font-bold text-black dark:text-white">
                      Password
                    </label>
                    <Input
                      id="staffPassword"
                      type="password"
                      placeholder="Enter your password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="border-2 border-black dark:border-white focus:ring-0 focus:border-black dark:focus:border-white rounded-none h-11 bg-white dark:bg-black"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-bold rounded-none border-2 border-black dark:border-white transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      'Sign In as Teacher'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            © 2026 EduFlow AI. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
