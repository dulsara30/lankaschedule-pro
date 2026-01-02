'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, School as SchoolIcon } from 'lucide-react';

export default function SetupSchoolPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [periodsPerDay, setPeriodsPerDay] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(5);

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create school
      const schoolResponse = await fetch('/api/school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schoolName,
          periodsPerDay,
          daysPerWeek,
        }),
      });

      const schoolData = await schoolResponse.json();

      if (!schoolData.success) {
        toast.error(schoolData.error || 'Failed to create school');
        setIsLoading(false);
        return;
      }

      const schoolId = schoolData.school._id;

      // Update user with schoolId
      const userResponse = await fetch('/api/user/update-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId }),
      });

      const userData = await userResponse.json();

      if (!userData.success) {
        toast.error('School created but failed to link to user');
        setIsLoading(false);
        return;
      }

      toast.success('School setup complete!');
      
      // Update session and redirect
      await update();
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Setup error:', error);
      toast.error('Failed to setup school');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center">
              <SchoolIcon className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-black">
              Welcome to EduFlow AI
            </h1>
            <p className="text-zinc-600 mt-2">
              Let's set up your school to get started
            </p>
          </div>
        </div>

        <Card className="border-2 border-black shadow-none">
          <CardHeader className="border-b-2 border-black">
            <CardTitle>School Information</CardTitle>
            <CardDescription>
              Configure your school's basic settings
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreateSchool} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="schoolName" className="text-sm font-bold text-black uppercase tracking-wide">
                  School Name
                </label>
                <Input
                  id="schoolName"
                  type="text"
                  placeholder="e.g., Springfield High School"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  required
                  disabled={isLoading}
                  className="border-2 border-black focus:ring-0 focus:border-black rounded-none h-11 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="periodsPerDay" className="text-sm font-bold text-black uppercase tracking-wide">
                    Periods Per Day
                  </label>
                  <Input
                    id="periodsPerDay"
                    type="number"
                    min="1"
                    max="12"
                    value={periodsPerDay}
                    onChange={(e) => setPeriodsPerDay(parseInt(e.target.value))}
                    required
                    disabled={isLoading}
                    className="border-2 border-black focus:ring-0 focus:border-black rounded-none h-11 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="daysPerWeek" className="text-sm font-bold text-black uppercase tracking-wide">
                    Days Per Week
                  </label>
                  <Input
                    id="daysPerWeek"
                    type="number"
                    min="1"
                    max="7"
                    value={daysPerWeek}
                    onChange={(e) => setDaysPerWeek(parseInt(e.target.value))}
                    required
                    disabled={isLoading}
                    className="border-2 border-black focus:ring-0 focus:border-black rounded-none h-11 bg-white"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-black hover:bg-zinc-800 text-white font-bold uppercase tracking-wide rounded-none border-2 border-black"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating School...
                  </>
                ) : (
                  'Create School'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
