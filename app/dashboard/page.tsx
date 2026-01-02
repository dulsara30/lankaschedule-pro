'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings, Users, BookOpen, GraduationCap, Clock, Play, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface DataCounts {
  subjects: number;
  teachers: number;
  classes: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<DataCounts>({ subjects: 0, teachers: 0, classes: 0 });
  const [generationReady, setGenerationReady] = useState(false);

  useEffect(() => {
    checkConfiguration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkConfiguration = async () => {
    try {
      // Check if school is configured
      const configRes = await fetch('/api/school/config');
      const configData = await configRes.json();
      
      if (!configData.success || !configData.data) {
        // Redirect to school setup if not configured
        router.push('/dashboard/school-setup');
        return;
      }

      // Fetch counts for subjects, teachers, and classes
      const [subjectsRes, teachersRes, classesRes] = await Promise.all([
        fetch('/api/subjects'),
        fetch('/api/teachers'),
        fetch('/api/classes'),
      ]);

      const [subjectsData, teachersData, classesData] = await Promise.all([
        subjectsRes.json(),
        teachersRes.json(),
        classesRes.json(),
      ]);

      const newCounts = {
        subjects: subjectsData.success ? subjectsData.data.length : 0,
        teachers: teachersData.success ? teachersData.data.length : 0,
        classes: classesData.success ? classesData.data.length : 0,
      };

      setCounts(newCounts);
      setGenerationReady(newCounts.subjects > 0 && newCounts.teachers > 0 && newCounts.classes > 0);
    } catch (error) {
      console.error('Error checking configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartGeneration = () => {
    if (!generationReady) {
      toast.error('Please add at least one subject, teacher, and class before generating timetable');
      return;
    }
    toast.info('Timetable generation feature coming soon!');
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Welcome to LankaSchedule Pro - Manage your school timetable efficiently
        </p>
      </div>

      {/* Generation Status Alert */}
      {!generationReady && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                  Setup Required
                </h3>
                <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
                  Please add at least one subject, teacher, and class to enable timetable generation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Generation Button */}
      <Card className={generationReady ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : ''}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                Timetable Generation
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {generationReady 
                  ? 'All requirements met. Ready to generate your school timetable.'
                  : 'Complete the setup requirements to generate your timetable.'}
              </p>
              <div className="mt-3 flex gap-4 text-sm">
                <span className={counts.subjects > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}>
                  ✓ {counts.subjects} Subject{counts.subjects !== 1 ? 's' : ''}
                </span>
                <span className={counts.teachers > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}>
                  ✓ {counts.teachers} Teacher{counts.teachers !== 1 ? 's' : ''}
                </span>
                <span className={counts.classes > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}>
                  ✓ {counts.classes} Class{counts.classes !== 1 ? 'es' : ''}
                </span>
              </div>
            </div>
            <Button 
              size="lg" 
              disabled={!generationReady}
              onClick={handleStartGeneration}
              className="gap-2"
            >
              <Play className="h-5 w-5" />
              Start Generation
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Settings className="mb-2 h-8 w-8 text-blue-600" />
            <CardTitle>School Setup</CardTitle>
            <CardDescription>
              Configure your school&apos;s basic settings, periods, and intervals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/school-setup">
              <Button className="w-full">Configure</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Users className="mb-2 h-8 w-8 text-green-600" />
            <CardTitle>Teachers</CardTitle>
            <CardDescription>
              Manage teacher profiles and workload requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/teachers">
              <Button variant="outline" className="w-full">Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <BookOpen className="mb-2 h-8 w-8 text-purple-600" />
            <CardTitle>Subjects</CardTitle>
            <CardDescription>
              Add and categorize subjects for your school
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/subjects">
              <Button variant="outline" className="w-full">Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <GraduationCap className="mb-2 h-8 w-8 text-orange-600" />
            <CardTitle>Classes</CardTitle>
            <CardDescription>
              Define classes and grade levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/classes">
              <Button variant="outline" className="w-full">Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Clock className="mb-2 h-8 w-8 text-red-600" />
            <CardTitle>Lessons</CardTitle>
            <CardDescription>
              Create lesson units with subjects, teachers, and classes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/lessons">
              <Button variant="outline" className="w-full">Manage</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
