'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  GraduationCap, 
  TrendingUp, 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  History,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer
} from 'recharts';

interface TimetableVersion {
  _id: string;
  versionName: string;
  isSaved: boolean;
  createdAt: string;
  slotCount: number;
}

interface TeacherWorkload {
  name: string;
  periods: number;
  email: string;
  status: 'underloaded' | 'optimal' | 'overloaded';
}

interface SubjectCoverage {
  name: string;
  periods: number;
  color: string;
}

interface ClassReadiness {
  name: string;
  grade: number | string;
  assigned: number;
  target: number;
  percentage: number;
}

interface AnalyticsStats {
  totalTeachers: number;
  totalClasses: number;
  scheduledEfficiency: number;
  totalSlots: number;
  totalVersions: number;
}

interface AnalyticsData {
  versionId: string | null;
  teacherWorkload: TeacherWorkload[];
  subjectCoverage: SubjectCoverage[];
  classReadiness: ClassReadiness[];
  stats: AnalyticsStats;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e'];

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  useEffect(() => {
    fetchVersions();
  }, []);

  useEffect(() => {
    if (selectedVersionId || versions.length > 0) {
      fetchAnalytics(selectedVersionId);
    }
  }, [selectedVersionId, versions]);

  const fetchVersions = async () => {
    try {
      const response = await fetch('/api/timetable/versions', { cache: 'no-store' });
      const data = await response.json();
      
      if (data.success && data.data.length > 0) {
        setVersions(data.data);
        // Auto-select latest version (draft first, then most recent saved)
        const latestDraft = data.data.find((v: TimetableVersion) => !v.isSaved);
        const versionToSelect = latestDraft || data.data[0];
        setSelectedVersionId(versionToSelect._id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
      setLoading(false);
    }
  };

  const fetchAnalytics = async (versionId: string) => {
    try {
      setLoading(true);
      const url = versionId ? `/api/analytics?versionId=${versionId}` : '/api/analytics';
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      
      if (data.success) {
        setAnalytics(data.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!analytics || !analytics.versionId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Analytics Dashboard
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Intelligent insights for school administrators
          </p>
        </div>

        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                  No Timetable Generated
                </h3>
                <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
                  Generate your first timetable to view analytics. Go to Lessons and click &quot;Generate Timetable&quot;.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { teacherWorkload, subjectCoverage, classReadiness, stats } = analytics;

  // Prepare chart data
  const workloadChartData = teacherWorkload.slice(0, 15).map(teacher => ({
    name: teacher.name.split(' ').slice(0, 2).join(' '), // Shorten names for chart
    periods: teacher.periods,
    fill: teacher.status === 'overloaded' ? '#ef4444' : teacher.status === 'underloaded' ? '#f59e0b' : '#10b981',
  }));

  return (
    <div className="space-y-6">
      {/* Header with Version Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Analytics Dashboard
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Intelligent insights for school administrators
          </p>
        </div>
        
        {versions.length > 0 && (
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-zinc-500" />
            <select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950"
            >
              {versions.map((version) => (
                <option key={version._id} value={version._id}>
                  {version.versionName} {version.isSaved ? '' : '(Draft)'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Active Teachers
              </CardTitle>
              <Users className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.totalTeachers}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Teaching staff registered
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Total Classes
              </CardTitle>
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.totalClasses}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Classes configured
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Scheduled Efficiency
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.scheduledEfficiency}%
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Lesson units placed
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Total Periods
              </CardTitle>
              <Calendar className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.totalSlots}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Weekly time slots
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workload Distribution Chart */}
      <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
            <CardTitle>Teacher Workload Distribution</CardTitle>
          </div>
          <CardDescription>
            Total periods assigned per teacher • Target range: 24-35 periods/week
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="periods" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Legend */}
          <div className="mt-4 flex gap-6 justify-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-zinc-600 dark:text-zinc-400">Overloaded (&gt;35)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-zinc-600 dark:text-zinc-400">Optimal (24-35)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-zinc-600 dark:text-zinc-400">Underloaded (&lt;24)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subject Coverage Summary */}
        <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle>Subject Coverage Summary</CardTitle>
            <CardDescription>
              Total periods per subject in weekly schedule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {subjectCoverage.map((subject, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: subject.color }}
                    ></div>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {subject.name}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">
                    {subject.periods}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Class Readiness Tracker */}
        <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle>Class Readiness Tracker</CardTitle>
            <CardDescription>
              Assigned vs. target periods per class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {classReadiness.map((classItem, index) => (
                <div key={index} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {classItem.name}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Grade {classItem.grade}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {classItem.assigned}/{classItem.target}
                      </span>
                      {classItem.percentage >= 90 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : classItem.percentage < 70 ? (
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        classItem.percentage >= 90 
                          ? 'bg-green-500' 
                          : classItem.percentage >= 70 
                          ? 'bg-blue-500' 
                          : 'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min(classItem.percentage, 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
