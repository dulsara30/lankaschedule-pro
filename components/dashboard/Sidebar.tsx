'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Calendar, Users, BookOpen, GraduationCap, Clock, CalendarDays, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

interface SchoolConfig {
  startTime: string;
  periodDuration: number;
  numberOfPeriods: number;
}

const navItems = [
  { href: '/dashboard', icon: Calendar, label: 'Dashboard' },
  { href: '/dashboard/school-setup', icon: Settings, label: 'School Setup' },
  { href: '/dashboard/teachers', icon: Users, label: 'Teachers' },
  { href: '/dashboard/subjects', icon: BookOpen, label: 'Subjects' },
  { href: '/dashboard/classes', icon: GraduationCap, label: 'Classes' },
  { href: '/dashboard/lessons', icon: Clock, label: 'Lessons' },
  { href: '/dashboard/timetable', icon: CalendarDays, label: 'Timetable' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [config, setConfig] = useState<SchoolConfig | null>(null);
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

  return (
    <aside className={`border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-zinc-200 p-6 dark:border-zinc-800 flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                LankaSchedule Pro
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Timetable Management
              </p>
            </div>
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

        {/* School Settings Summary */}
        {config && !isCollapsed && (
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <Card className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Current Settings
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">Start Time:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {config.startTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">Period:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {config.periodDuration} min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">Periods:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {config.numberOfPeriods}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </aside>
  );
}
