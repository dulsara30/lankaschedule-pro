import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings, Users, BookOpen, GraduationCap, Clock } from 'lucide-react';

export default function DashboardPage() {
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
            <Link href="/dashboard/setup">
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
