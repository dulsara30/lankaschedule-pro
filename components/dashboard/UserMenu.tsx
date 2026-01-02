'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { LogOut, User, School, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SchoolInfo {
  name: string;
}

export function UserMenu() {
  const { data: session } = useSession();
  const [schoolName, setSchoolName] = useState<string>('');

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

  if (!session) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="border-2 border-black hover:bg-zinc-50 rounded-none h-auto py-2 px-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-black text-white rounded-none">
              <User className="h-5 w-5" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold text-black">
                {session.user.name}
              </span>
              {schoolName && (
                <span className="text-xs text-zinc-600 flex items-center gap-1">
                  <School className="h-3 w-3" />
                  {schoolName}
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-black ml-2" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 border-2 border-black rounded-none shadow-lg"
      >
        <DropdownMenuLabel className="border-b-2 border-black pb-3">
          <div className="flex flex-col space-y-2">
            <p className="text-sm font-bold text-black uppercase tracking-wide">
              Account Information
            </p>
            <p className="text-sm text-black font-medium">{session.user.name}</p>
            <p className="text-xs text-zinc-600">{session.user.email}</p>
            {schoolName && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-zinc-50 border-2 border-black">
                <School className="h-4 w-4 text-black" />
                <div>
                  <p className="text-xs font-bold text-black uppercase">School</p>
                  <p className="text-sm text-black">{schoolName}</p>
                </div>
              </div>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-black" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span className="font-bold uppercase text-xs tracking-wide">Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
