'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Settings, Calendar, Users, BookOpen, GraduationCap, Clock, CalendarDays, PanelLeftClose, PanelLeft, MessageSquare, UserCircle, LogOut } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

interface SchoolConfig {
  startTime: string;
  periodDuration: number;
  numberOfPeriods: number;
}

interface SchoolInfo {
  name: string;
}

const navItems = [
  { href: '/dashboard', icon: Calendar, label: 'Dashboard' },
  { href: '/dashboard/school-setup', icon: Settings, label: 'School Setup' },
  { href: '/dashboard/teachers', icon: Users, label: 'Teachers' },
  { href: '/dashboard/subjects', icon: BookOpen, label: 'Subjects' },
  { href: '/dashboard/classes', icon: GraduationCap, label: 'Classes' },
  { href: '/dashboard/lessons', icon: Clock, label: 'Lessons' },
  { href: '/dashboard/timetable', icon: CalendarDays, label: 'Timetable' },
  { href: '/dashboard/communications', icon: MessageSquare, label: 'Communications' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [config, setConfig] = useState<SchoolConfig | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fetchConfig = () => {
    fetch('/api/school/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfig(data.data?.config);
        }
      })
      .catch(() => {
        // Silently fail - config might not exist yet
      });
  };

  useEffect(() => {
    fetchConfig();

    // Listen for config updates
    const handleConfigUpdate = () => fetchConfig();
    window.addEventListener('schoolConfigUpdated', handleConfigUpdate);

    return () => {
      window.removeEventListener('schoolConfigUpdated', handleConfigUpdate);
    };
  }, []);

  useEffect(() => {
    if (session?.user.schoolId) {
      fetch('/api/school/info')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setSchoolName(data.school.name);
          }
        })
        .catch(() => {
          setSchoolName('Your School');
        });
    }
  }, [session?.user.schoolId]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <aside className={`border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-zinc-200 p-6 dark:border-zinc-800 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="EduFlow AI Logo"
                width={40}
                height={40}
                className="rounded-md"
              />
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                  EduFlow AI
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Intelligent Scheduling
                </p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <Image
              src="/logo.png"
              alt="EduFlow AI"
              width={32}
              height={32}
              className="rounded-md mx-auto"
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`h-8 w-8 p-0 ${isCollapsed ? 'mx-auto' : ''}`}
          >
            {isCollapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isCollapsed ? 'justify-center' : ''} ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-50'
                }`}
              >
                <Icon className="h-5 w-5" />
                {!isCollapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Profile Section */}
        {session && (
          <div className="border-t-2 border-black dark:border-white p-4">
            {!isCollapsed ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black dark:bg-white">
                    <UserCircle className="h-6 w-6 text-white dark:text-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white truncate">
                      {session.user.name}
                    </p>
                    {schoolName && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate leading-tight mt-0.5">
                        {schoolName}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full justify-start gap-2 border-2 border-black dark:border-white rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold"
                  size="sm"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className="w-full p-2 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                title="Sign Out"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
