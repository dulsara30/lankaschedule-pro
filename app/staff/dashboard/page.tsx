'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, Clock, Users, Search, LogOut, Download, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import Image from 'next/image';
import { PDFDownloadLink } from '@react-pdf/renderer';
import TimetablePDF from '@/components/timetable/TimetablePDF';
import { toPng } from 'html-to-image';

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
  config: {
    startTime: string;
    periodDuration: number;
    numberOfPeriods: number;
    intervalSlots: Array<{ afterPeriod: number; duration: number }>;
  };
}

export default function TeacherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [adminNote, setAdminNote] = useState<string>('');
  const [versionName, setVersionName] = useState<string>('');
  const [mySchedule, setMySchedule] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classSchedule, setClassSchedule] = useState<TimetableSlot[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const fetchDashboardData = async () => {
    // Absolute guard: prevent duplicate fetch attempts
    if (hasFetched) {
      console.log('Already fetched, skipping...');
      return;
    }
    
    // Set flags as the ABSOLUTE FIRST actions
    setHasFetched(true);
    setIsLoading(true);
    
    try {
      console.log('Fetching dashboard data...');
      
      // Fetch published timetable with admin note (no cache)
      const publishedRes = await fetch('/api/staff/published-timetable', {
        cache: 'no-store',
      });
      if (publishedRes.ok) {
        const data = await publishedRes.json();
        console.log('Published timetable response:', data);
        console.log('My schedule slots:', data.mySchedule);
        
        if (data.success) {
          setAdminNote(data.version?.adminNote || '');
          setVersionName(data.version?.versionName || '');
          const scheduleData = data.mySchedule || [];
          console.log('Setting mySchedule with', scheduleData.length, 'slots');
          console.log('UI STATE: mySchedule updated with', scheduleData.length, 'items');
          console.log('First slot sample:', scheduleData[0]);
          setMySchedule(scheduleData);
          
          // Show feedback if version exists but no lessons assigned
          if (data.version && scheduleData.length === 0) {
            console.log('Published version found but no lessons assigned to this teacher');
          }
          
          if (!data.version) {
            console.log('No published version found');
          }
        } else {
          console.error('Failed to fetch published timetable:', data.error);
          setHasFetched(true); // Prevent retry on error
        }
      } else {
        console.error('Failed to fetch published timetable with status:', publishedRes.status);
        setHasFetched(true); // Prevent retry on error
      }

      // Fetch school info (no cache)
      const schoolRes = await fetch('/api/staff/school-info', {
        cache: 'no-store',
      });
      if (schoolRes.ok) {
        const schoolData = await schoolRes.json();
        if (schoolData.success) {
          setSchoolInfo(schoolData.school);
        }
      }

      // Fetch classes for dropdown (no cache)
      const classesRes = await fetch('/api/staff/classes', {
        cache: 'no-store',
      });
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
      console.log('DEBUG: Loading state cleared, ready to render');
    }
  };

  useEffect(() => {
    // First condition: prevent re-fetch if already fetched
    if (hasFetched) {
      return;
    }
    
    // Handle unauthorized access
    if (status === 'unauthenticated') {
      router.push('/');
      return;
    }
    
    if (status === 'authenticated' && session && session.user.role !== 'teacher') {
      router.push('/');
      return;
    }
    
    // Only fetch if authenticated and teacher role confirmed
    if (status === 'authenticated' && session?.user?.role === 'teacher') {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user.role, hasFetched, router]);

  const fetchClassSchedule = async (classId: string) => {
    try {
      const res = await fetch(`/api/staff/class-schedule?classId=${classId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setClassSchedule(data.schedule || []);
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
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  const handleDownloadImage = async () => {
    const element = document.getElementById('timetable-to-capture');
    if (!element) {
      toast.error('Timetable not found');
      return;
    }

    try {
      // Temporarily hide download buttons during capture
      const buttons = element.querySelectorAll('button');
      buttons.forEach(btn => btn.style.visibility = 'hidden');

      // Use html-to-image with high-quality settings
      const dataUrl = await toPng(element, {
        cacheBust: true, // Ensure fresh render
        pixelRatio: 2, // High resolution (2x)
        backgroundColor: '#ffffff', // White background
      });

      // Restore buttons
      buttons.forEach(btn => btn.style.visibility = 'visible');

      // Download the image
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${session?.user?.name || 'timetable'}-timetable.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Timetable image downloaded!');
    } catch (error) {
      console.error('Error generating image:', error);
      // Restore buttons even on error
      const buttons = element.querySelectorAll('button');
      buttons.forEach(btn => btn.style.visibility = 'visible');
      toast.error('Failed to generate image');
    }
  };

  const calculatePeriodTime = (periodNumber: number) => {
    // Safety guard: prevent crash if schoolInfo or startTime is missing
    if (!schoolInfo?.config?.startTime) return '00:00';
    
    const [hours, minutes] = schoolInfo.config.startTime.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes + (periodNumber - 1) * schoolInfo.config.periodDuration;
    
    // Add interval durations for intervals that occurred before this period
    for (const interval of schoolInfo.config.intervalSlots || []) {
      if (interval.afterPeriod < periodNumber) {
        totalMinutes += interval.duration;
      }
    }
    
    const endMinutes = totalMinutes + schoolInfo.config.periodDuration;
    
    const startHours = Math.floor(totalMinutes / 60);
    const startMins = totalMinutes % 60;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    
    return `${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')} - ${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  };

  const calculateIntervalTime = (afterPeriod: number): string => {
    if (!schoolInfo?.config?.startTime) return '00:00';
    
    // Calculate end time of the period after which interval occurs
    const [hours, minutes] = schoolInfo.config.startTime.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes + afterPeriod * schoolInfo.config.periodDuration;
    
    // Add all interval durations up to and including this interval
    for (const interval of schoolInfo.config.intervalSlots || []) {
      if (interval.afterPeriod <= afterPeriod) {
        totalMinutes += interval.duration;
      }
    }
    
    const resultHours = Math.floor(totalMinutes / 60);
    const resultMinutes = totalMinutes % 60;
    
    return `${String(resultHours).padStart(2, '0')}:${String(resultMinutes).padStart(2, '0')}`;
  };

  const renderScheduleGrid = (schedule: TimetableSlot[], title: string, isTeacherSchedule: boolean = false) => {
    // Strict guard: Do not render if essential data is missing
    if (!schoolInfo || !schedule) {
      return (
        <Card className="border-2 border-black dark:border-white rounded-none">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-black dark:text-white mx-auto mb-2" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading schedule data...</p>
          </CardContent>
        </Card>
      );
    }

    // Diagnostic log
    console.log('DEBUG: School periods:', schoolInfo.config?.numberOfPeriods, 'My slots count:', schedule.length);
    
    // Fix NaN: Explicitly convert to Number with fallback to 8
    const periodsCount = Math.max(
      Number(schoolInfo?.config?.numberOfPeriods || 8),
      ...schedule.map(s => Number(s.periodNumber) || 0)
    );
    
    console.log('DEBUG: Rendering periods up to:', periodsCount);
    const periods = Array.from({ length: periodsCount }, (_, i) => i + 1);

    return (
      <Card className="border-2 border-black dark:border-white rounded-none">
        <CardHeader className="border-b-2 border-black dark:border-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-black dark:text-white">{title}</CardTitle>
            {/* Download Buttons - Only show when data is ready */}
            {isTeacherSchedule && (
              <div className="flex gap-2">
                {/* PDF Download Button */}
                {status === 'authenticated' && 
                mySchedule && 
                mySchedule.length > 0 && 
                versionName && 
                schoolInfo && 
                schoolInfo.config?.startTime && 
                schoolInfo.config?.periodDuration && 
                schoolInfo.config?.numberOfPeriods && 
                session?.user?.name ? (
                  <>
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
                        day: String(slot.day).trim(), // Absolute String conversion
                        periodNumber: Number(slot.periodNumber), // Ensure number type
                        isDoubleStart: slot.isDoubleStart || false,
                        isDoubleEnd: slot.isDoubleEnd || false,
                        classId: {
                          _id: '',
                          name: slot.className || '',
                          grade: '',
                        },
                        lessonId: {
                          _id: slot._id, // Use actual slot ID
                          lessonName: slot.subject || '',
                          subjectIds: [],
                          teacherIds: [{ 
                            _id: session.user.id, 
                            name: session.user.name || 'Teacher' 
                          }],
                          classIds: [],
                        },
                      }))}
                      versionName={versionName}
                      config={{
                        startTime: schoolInfo.config.startTime || '08:00',
                        periodDuration: schoolInfo.config.periodDuration || 40,
                        numberOfPeriods: schoolInfo.config.numberOfPeriods || 8,
                        intervalSlots: schoolInfo.config.intervalSlots || [],
                      }}
                      lessonNameMap={{}}
                      schoolName={schoolInfo.name || 'School'}
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
                
                {/* Image Download Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadImage}
                  className="border-2 border-black dark:border-white rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Download Image
                </Button>
              </>
            ) : mySchedule.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="border-2 border-black dark:border-white rounded-none font-bold"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Preparing PDF...
                </Button>
              ) : null
            }
            </div>
          )}
          {!isTeacherSchedule && (
              // Strict PDF guard: verify ALL required data exists including startTime
              status === 'authenticated' && 
              classSchedule && 
              classSchedule.length > 0 && 
              versionName && 
              schoolInfo && 
              schoolInfo.config?.startTime && 
              schoolInfo.config?.periodDuration && 
              schoolInfo.config?.numberOfPeriods && 
              selectedClass ? (
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
                      startTime: schoolInfo.config.startTime || '08:00',
                      periodDuration: schoolInfo.config.periodDuration || 40,
                      numberOfPeriods: schoolInfo.config.numberOfPeriods || 8,
                      intervalSlots: schoolInfo.config.intervalSlots || [],
                    }}
                    lessonNameMap={{}}
                    schoolName={schoolInfo.name || 'School'}
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
            ) : classSchedule.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="border-2 border-black dark:border-white rounded-none font-bold"
              >
                <Download className="h-4 w-4 mr-2" />
                Preparing PDF...
              </Button>
            ) : null
          )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Responsive: Horizontal scroll on small screens */}
          <div className="overflow-x-auto" id="timetable-to-capture">
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
                {periods.map((period) => {
                  // Check if there's an interval after this period
                  const intervalAfterThisPeriod = schoolInfo.config?.intervalSlots?.find(
                    (slot) => slot.afterPeriod === period
                  );
                  
                  return (
                    <React.Fragment key={period}>
                      <tr className="border-b-2 border-black dark:border-white last:border-b-0">
                        <td className="border-r-2 border-black dark:border-white p-2 md:p-3 font-bold text-black dark:text-white text-xs md:text-sm bg-zinc-50 dark:bg-zinc-900">
                          <div className="flex flex-col">
                            <span>P{period}</span>
                            <span className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 font-normal whitespace-nowrap">
                              {calculatePeriodTime(period)}
                            </span>
                          </div>
                        </td>
                        {days.map((day) => {
                          // Absolute comparison with String() wrapper to handle any type or hidden space issues
                          const slot = schedule.find(
                            (s) => String(s.day).trim().toLowerCase() === String(day).trim().toLowerCase() && 
                                   Number(s.periodNumber) === Number(period)
                          );
                          
                          // Debug log for first few slots
                          if (period === 1 && schedule.length > 0) {
                            console.log(`Looking for ${day} P${period}, found:`, slot ? 'YES' : 'NO', 
                                        `Slot data:`, slot ? `${slot.day} P${slot.periodNumber}` : 'N/A');
                          }
                          
                          return (
                            <td
                              key={`${day}-${period}`}
                              className="border-r-2 border-black dark:border-white p-2 md:p-3 text-xs last:border-r-0 align-middle"
                            >
                              {slot ? (
                                <div 
                                  className="h-20 w-full rounded-2xl flex flex-col justify-center items-center text-white relative shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden"
                                  style={{
                                    background: `linear-gradient(135deg, #3B82F6 0%, #3B82F6EE 100%)`,
                                  }}
                                >
                                  {/* Subtle white overlay for text contrast */}
                                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                  
                                  {/* Modern double period badge */}
                                  {slot.isDoubleStart && (
                                    <div className="absolute top-1 right-1 bg-white/20 backdrop-blur-lg border border-white/30 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-lg z-10">
                                      DOUBLE
                                    </div>
                                  )}
                                  
                                  <div className="relative z-10 flex flex-col justify-center items-center px-2">
                                    <div className="text-xs md:text-sm font-bold leading-tight text-center drop-shadow-md">
                                      {slot.subject}
                                    </div>
                                    {slot.className && (
                                      <div className="text-[10px] md:text-xs opacity-90 mt-1 text-center font-medium">
                                        {slot.className}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="h-20 flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs italic">Free</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      
                      {/* Interval Row - appears immediately after the period */}
                      {intervalAfterThisPeriod && (
                        <tr className="bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 dark:from-amber-950/20 dark:via-amber-900/30 dark:to-amber-950/20">
                          <td
                            className="border border-zinc-200 dark:border-zinc-800 p-3 md:p-4 text-center font-bold text-xs md:text-sm uppercase tracking-wider text-amber-700 dark:text-amber-400"
                            style={{
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(251, 191, 36, 0.1) 10px, rgba(251, 191, 36, 0.1) 20px)',
                            }}
                          >
                            ☕ INTERVAL
                          </td>
                          <td
                            colSpan={days.length}
                            className="border border-zinc-200 dark:border-zinc-800 p-3 md:p-4 text-center text-xs md:text-sm text-amber-700 dark:text-amber-400 font-semibold"
                            style={{
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(251, 191, 36, 0.1) 10px, rgba(251, 191, 36, 0.1) 20px)',
                            }}
                          >
                            {intervalAfterThisPeriod.duration} minutes • {calculateIntervalTime(period)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-black gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-black dark:text-white" />
        <p className="text-black dark:text-white font-medium">Loading Teacher Portal...</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Fetching your schedule and school information</p>
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
        {/* School Configuration Warning */}
        {schoolInfo && (!schoolInfo.config?.startTime || !schoolInfo.config?.periodDuration || !schoolInfo.config?.numberOfPeriods) && (
          <Card className="border-2 border-yellow-500 dark:border-yellow-400 rounded-none bg-yellow-50 dark:bg-yellow-950">
            <CardHeader className="border-b-2 border-yellow-500 dark:border-yellow-400">
              <CardTitle className="text-lg font-bold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Missing School Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                School configuration is incomplete. Some features may not work correctly. Please contact the administration to complete the school setup.
              </p>
            </CardContent>
          </Card>
        )}

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
              <CardContent className="pt-6 text-center space-y-3">
                {isLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-black dark:text-white" />
                    <p className="text-zinc-900 dark:text-zinc-100 font-medium">Loading Schedule...</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Please wait while we fetch your timetable</p>
                  </div>
                ) : (
                  <>
                    <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                      {versionName ? 'Timetable is published, but no lessons are assigned to you yet.' : 'No Published Timetable'}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {versionName 
                        ? 'The administration has published a timetable, but you currently have no assigned lessons. Please contact the administration if this seems incorrect.'
                        : 'Please wait for the administration to publish a timetable. You will see your schedule here once it\'s available.'}
                    </p>
                  </>
                )}
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
