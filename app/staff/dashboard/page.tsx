'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, Clock, Users, Search, LogOut, Download } from 'lucide-react';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import Image from 'next/image';
import { PDFDownloadLink } from '@react-pdf/renderer';
import TimetablePDF from '@/components/timetable/TimetablePDF';

interface TimetableSlot {
  _id: string;
  day: string;
  periodNumber: number;
  subject: string;
  className: string;
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
}

interface ClassOption {
  _id: string;
  name: string;
  grade: number;
}

interface SchoolInfo {
  name: string;
  startTime: string;
  periodDuration: number;
  numberOfPeriods: number;
}

export default function TeacherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [adminNote, setAdminNote] = useState<string>('');
  const [versionName, setVersionName] = useState<string>('');
  const [mySchedule, setMySchedule] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classSchedule, setClassSchedule] = useState<TimetableSlot[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPDFDownload, setShowPDFDownload] = useState(false);
  const [showClassPDF, setShowClassPDF] = useState(false);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && session?.user.role !== 'teacher') {
      router.push('/');
    } else if (status === 'authenticated') {
      fetchDashboardData();
    }
  }, [status, session, router]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // Fetch published timetable with admin note
      const publishedRes = await fetch('/api/staff/published-timetable');
      if (publishedRes.ok) {
        const data = await publishedRes.json();
        if (data.success) {
          setAdminNote(data.version?.adminNote || '');
          setVersionName(data.version?.versionName || 'Current Timetable');
          const scheduleData = data.mySchedule || [];
          setMySchedule(scheduleData);
          setShowPDFDownload(scheduleData.length > 0);
          
          // Show feedback if version exists but no lessons assigned
          if (data.version && scheduleData.length === 0) {
            console.log('Published version found but no lessons assigned to this teacher');
          }
        } else {
          console.error('Failed to fetch published timetable:', data.error);
        }
      } else {
        console.error('Failed to fetch published timetable:', publishedRes.status);
      }

      // Fetch school info
      const schoolRes = await fetch('/api/staff/school-info');
      if (schoolRes.ok) {
        const schoolData = await schoolRes.json();
        if (schoolData.success) {
          setSchoolInfo(schoolData.school);
        }
      }

      // Fetch classes for dropdown
      const classesRes = await fetch('/api/staff/classes');
      if (classesRes.ok) {
        const classesData = await classesRes.json();
        if (classesData.success) {
          setClasses(classesData.classes || []);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClassSchedule = async (classId: string) => {
    try {
      const res = await fetch(`/api/staff/class-schedule?classId=${classId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setClassSchedule(data.schedule || []);
          setShowClassPDF(data.schedule && data.schedule.length > 0);
        }
      }
    } catch (error) {
      console.error('Error fetching class schedule:', error);
      toast.error('Failed to load class schedule');
    }
  };

  const handleClassSelect = (classId: string) => {
    setSelectedClass(classId);
    if (classId) {
      fetchClassSchedule(classId);
    } else {
      setClassSchedule([]);
      setShowClassPDF(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  const calculatePeriodTime = (periodNumber: number) => {
    if (!schoolInfo) return '';
    const [hours, minutes] = schoolInfo.startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + (periodNumber - 1) * schoolInfo.periodDuration;
    const endMinutes = totalMinutes + schoolInfo.periodDuration;
    
    const startHours = Math.floor(totalMinutes / 60);
    const startMins = totalMinutes % 60;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    
    return `${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')} - ${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  };

  const renderScheduleGrid = (schedule: TimetableSlot[], title: string, isTeacherSchedule: boolean = false) => {
    if (!schoolInfo) return null;

    const periods = Array.from({ length: schoolInfo.numberOfPeriods }, (_, i) => i + 1);

    return (
      <Card className="border-2 border-black dark:border-white rounded-none">
        <CardHeader className="border-b-2 border-black dark:border-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-black dark:text-white">{title}</CardTitle>
            {/* Download Button - Only show when data is ready */}
            {isTeacherSchedule && showPDFDownload && schoolInfo && session?.user.name && mySchedule.length > 0 && versionName && (
              <PDFDownloadLink
                document={
                  <TimetablePDF
                    type="teacher"
                    entities={[{
                      id: session.user.id,
                      name: session.user.name,
                    }]}
                    slots={mySchedule.map(slot => ({
                      _id: slot._id,
                      day: slot.day,
                      periodNumber: slot.periodNumber,
                      isDoubleStart: slot.isDoubleStart,
                      isDoubleEnd: slot.isDoubleEnd,
                      classId: {
                        _id: '',
                        name: slot.className,
                        grade: '',
                      },
                      lessonId: {
                        _id: '',
                        lessonName: slot.subject,
                        subjectIds: [],
                        teacherIds: [{ _id: session.user.id, name: session.user.name || 'Teacher' }],
                        classIds: [],
                      },
                    }))}
                    versionName={versionName}
                    config={{
                      startTime: schoolInfo.startTime,
                      periodDuration: schoolInfo.periodDuration,
                      numberOfPeriods: schoolInfo.numberOfPeriods,
                      intervalSlots: [],
                    }}
                    lessonNameMap={{}}
                    schoolName={schoolInfo.name}
                    showTimeColumn={true}
                  />
                }
                fileName={`${session.user.name}-schedule.pdf`}
              >
                {({ loading }) => (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    className="border-2 border-black dark:border-white rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {loading ? 'Preparing...' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            )}
            {!isTeacherSchedule && showClassPDF && schoolInfo && selectedClass && classSchedule.length > 0 && versionName && (
              <PDFDownloadLink
                document={
                  <TimetablePDF
                    type="class"
                    entities={[{
                      id: selectedClass,
                      name: classes.find(c => c._id === selectedClass)?.name || 'Class',
                    }]}
                    slots={classSchedule.map(slot => ({
                      _id: slot._id,
                      day: slot.day,
                      periodNumber: slot.periodNumber,
                      isDoubleStart: slot.isDoubleStart,
                      isDoubleEnd: slot.isDoubleEnd,
                      classId: {
                        _id: selectedClass,
                        name: classes.find(c => c._id === selectedClass)?.name || 'Class',
                        grade: classes.find(c => c._id === selectedClass)?.grade || '',
                      },
                      lessonId: {
                        _id: '',
                        lessonName: slot.subject,
                        subjectIds: [],
                        teacherIds: [],
                        classIds: [],
                      },
                    }))}
                    versionName={versionName}
                    config={{
                      startTime: schoolInfo.startTime,
                      periodDuration: schoolInfo.periodDuration,
                      numberOfPeriods: schoolInfo.numberOfPeriods,
                      intervalSlots: [],
                    }}
                    lessonNameMap={{}}
                    schoolName={schoolInfo.name}
                    showTimeColumn={true}
                  />
                }
                fileName={`${classes.find(c => c._id === selectedClass)?.name}-timetable.pdf`}
              >
                {({ loading }) => (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    className="border-2 border-black dark:border-white rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {loading ? 'Preparing...' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Responsive: Horizontal scroll on small screens */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b-2 border-black dark:border-white bg-zinc-50 dark:bg-zinc-900">
                  <th className="border-r-2 border-black dark:border-white p-2 md:p-3 text-left font-bold text-black dark:text-white text-xs md:text-sm min-w-[100px] md:min-w-[120px]">
                    Period / Day
                  </th>
                  {days.map((day) => (
                    <th key={day} className="border-r-2 border-black dark:border-white p-2 md:p-3 text-center font-bold text-black dark:text-white text-xs md:text-sm min-w-[120px] md:min-w-[150px] last:border-r-0">
                      <span className="hidden md:inline">{day}</span>
                      <span className="md:hidden">{day.slice(0, 3)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period} className="border-b-2 border-black dark:border-white last:border-b-0">
                    <td className="border-r-2 border-black dark:border-white p-2 md:p-3 font-bold text-black dark:text-white text-xs md:text-sm bg-zinc-50 dark:bg-zinc-900">
                      <div className="flex flex-col">
                        <span>P{period}</span>
                        <span className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 font-normal whitespace-nowrap">
                          {calculatePeriodTime(period)}
                        </span>
                      </div>
                    </td>
                    {days.map((day) => {
                      const slot = schedule.find(
                        (s) => s.day === day && s.periodNumber === period
                      );
                      
                      return (
                        <td
                          key={`${day}-${period}`}
                          className="border-r-2 border-black dark:border-white p-1 md:p-2 text-xs last:border-r-0 align-top"
                        >
                          {slot ? (
                            <div className={`p-1 md:p-2 ${slot.isDoubleStart ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950' : ''}`}>
                              <div className="font-bold text-black dark:text-white truncate text-[10px] md:text-xs">
                                {slot.subject}
                              </div>
                              {slot.className && (
                                <div className="text-zinc-600 dark:text-zinc-400 truncate text-[9px] md:text-xs mt-0.5">
                                  {slot.className}
                                </div>
                              )}
                              {slot.isDoubleStart && (
                                <div className="text-blue-600 dark:text-blue-400 text-[8px] md:text-[10px] mt-1">
                                  Double Period
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-1 md:p-2 text-zinc-400 dark:text-zinc-600 text-center">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  const filteredClasses = classes.filter((cls) =>
    cls.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-black dark:text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <header className="border-b-2 border-black dark:border-white bg-white dark:bg-black sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="EduFlow AI" width={40} height={40} className="object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-black dark:text-white">EduFlow AI</h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Teacher Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-bold text-black dark:text-white">{session?.user.name}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{schoolInfo?.name}</p>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="border-2 border-black dark:border-white rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Admin Announcement */}
        {adminNote && (
          <Card className="border-2 border-black dark:border-white rounded-none bg-zinc-50 dark:bg-zinc-900">
            <CardHeader className="border-b-2 border-black dark:border-white">
              <CardTitle className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Announcement from Administration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm text-black dark:text-white whitespace-pre-wrap">{adminNote}</p>
            </CardContent>
          </Card>
        )}

        {/* Personal Schedule */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-black dark:text-white" />
            <h2 className="text-2xl font-bold text-black dark:text-white">My Teaching Schedule</h2>
          </div>
          {mySchedule.length > 0 ? (
            renderScheduleGrid(mySchedule, 'Your Weekly Schedule', true)
          ) : (
            <Card className="border-2 border-black dark:border-white rounded-none">
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {versionName ? 'No Assigned Lessons' : 'No Published Timetable'}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {versionName 
                    ? 'You have no assigned lessons in the current published timetable.'
                    : 'Please wait for the administration to publish a timetable.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* School Explorer */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-black dark:text-white" />
            <h2 className="text-2xl font-bold text-black dark:text-white">School Explorer</h2>
          </div>
          
          <Card className="border-2 border-black dark:border-white rounded-none">
            <CardHeader className="border-b-2 border-black dark:border-white">
              <CardTitle className="text-lg font-bold text-black dark:text-white">View Class Timetables</CardTitle>
              <CardDescription className="text-zinc-600 dark:text-zinc-400">
                Search and view any class schedule in your school (read-only)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    placeholder="Search for a class..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-2 border-black dark:border-white rounded-none"
                  />
                </div>
                <Select value={selectedClass} onValueChange={handleClassSelect}>
                  <SelectTrigger className="w-full sm:w-[250px] border-2 border-black dark:border-white rounded-none">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredClasses.map((cls) => (
                      <SelectItem key={cls._id} value={cls._id}>
                        {cls.name} (Grade {cls.grade})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Selected Class Schedule */}
          {selectedClass && classSchedule.length > 0 && (
            <div className="mt-6">
              {renderScheduleGrid(
                classSchedule,
                `Schedule for ${classes.find((c) => c._id === selectedClass)?.name || 'Selected Class'}`,
                false
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
