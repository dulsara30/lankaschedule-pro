'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Users, User } from 'lucide-react';
import { toast } from 'sonner';

interface Subject {
  _id: string;
  name: string;
  color: string;
}

interface Teacher {
  _id: string;
  name: string;
}

interface Class {
  _id: string;
  name: string;
  grade: number | string;
}

interface Lesson {
  _id: string;
  lessonName: string;
  subjectIds: Subject[];
  teacherIds: Teacher[];
  classIds: Class[];
}

interface TimetableSlot {
  _id: string;
  classId: Class;
  lessonId: Lesson;
  day: string;
  periodNumber: number;
  isDoubleStart?: boolean;  // First period of a double block
  isDoubleEnd?: boolean;    // Second period of a double block
}

interface SchoolConfig {
  startTime: string;
  periodDuration: number;
  numberOfPeriods: number;
  intervalSlots: Array<{ afterPeriod: number; duration: number }>;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetablePage() {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [config, setConfig] = useState<SchoolConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'class' | 'teacher'>('class');
  const [selectedEntity, setSelectedEntity] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [slotsRes, classesRes, teachersRes, configRes] = await Promise.all([
        fetch('/api/timetable', { cache: 'no-store' }),
        fetch('/api/classes', { cache: 'no-store' }),
        fetch('/api/teachers', { cache: 'no-store' }),
        fetch('/api/school/config', { cache: 'no-store' }),
      ]);

      const [slotsData, classesData, teachersData, configData] = await Promise.all([
        slotsRes.json(),
        classesRes.json(),
        teachersRes.json(),
        configRes.json(),
      ]);

      console.log('🔍 Client: Slots received:', slotsData.data?.length || 0);
      console.log('📦 Client: Sample slot:', slotsData.data?.[0]);
      
      // Debug: Check for double period flags
      if (slotsData.data && slotsData.data.length > 0) {
        const doubleStartSlots = slotsData.data.filter((s: TimetableSlot) => s.isDoubleStart).length;
        const doubleEndSlots = slotsData.data.filter((s: TimetableSlot) => s.isDoubleEnd).length;
        console.log('🔄 Double period stats:');
        console.log(`   - Double starts: ${doubleStartSlots}`);
        console.log(`   - Double ends: ${doubleEndSlots}`);
        console.log(`   - Total slots: ${slotsData.data.length}`);
      }
      
      console.log('📋 Client: Classes:', classesData.data?.length || 0);
      console.log('⚙️ Client: Config:', configData.data);

      if (slotsData.success) setSlots(slotsData.data || []);
      if (classesData.success) {
        const classList = classesData.data || [];
        setClasses(classList);
        if (classList.length > 0) setSelectedEntity(classList[0]._id);
      }
      if (teachersData.success) setTeachers(teachersData.data || []);
      if (configData.success) setConfig(configData.data?.config || configData.data);
    } catch (error) {
      console.error('❌ Client: Error loading timetable:', error);
      toast.error('Failed to load timetable data');
    } finally {
      setLoading(false);
    }
  };

  const calculateTime = (periodNumber: number): string => {
    if (!config) return '';
    
    const [hours, minutes] = config.startTime.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes;
    
    // Add duration for periods before this one
    totalMinutes += (periodNumber - 1) * config.periodDuration;
    
    // Add interval durations for intervals that occurred before this period
    for (const interval of config.intervalSlots) {
      if (interval.afterPeriod < periodNumber) {
        totalMinutes += interval.duration;
      }
    }
    
    const resultHours = Math.floor(totalMinutes / 60);
    const resultMinutes = totalMinutes % 60;
    
    return `${String(resultHours).padStart(2, '0')}:${String(resultMinutes).padStart(2, '0')}`;
  };

  const calculateIntervalTime = (afterPeriod: number): string => {
    if (!config) return '';
    
    // Calculate end time of the period after which interval occurs
    const periodEndTime = calculateTime(afterPeriod + 1);
    return periodEndTime;
  };

  const getSlotForPeriod = (day: string, period: number): TimetableSlot | undefined => {
    if (viewMode === 'class') {
      const slot = slots.find(
        slot => slot.day === day && 
                slot.periodNumber === period && 
                slot.classId?._id === selectedEntity
      );
      return slot;
    } else {
      // Teacher view: find any slot where this teacher is teaching
      const slot = slots.find(
        slot => slot.day === day && 
                slot.periodNumber === period && 
                slot.lessonId?.teacherIds?.some(t => t?._id === selectedEntity)
      );
      return slot;
    }
  };

  const renderSlotContent = (slot: TimetableSlot | undefined, isDoubleStart: boolean = false) => {
    if (!slot) {
      return <div className="text-xs text-zinc-400 italic p-2">Free</div>;
    }

    const lesson = slot.lessonId;
    if (!lesson || !lesson.subjectIds || !lesson.teacherIds || !lesson.classIds) {
      return <div className="text-xs text-zinc-400 italic p-2">Invalid data</div>;
    }

    const subjects = lesson.subjectIds;
    
    // Rainbow gradient background - continuous vertical flow for double periods
    let backgroundStyle: React.CSSProperties;
    
    if (subjects.length === 1) {
      // Single subject - solid color
      backgroundStyle = { backgroundColor: subjects[0]?.color || '#3B82F6' };
    } else {
      // Multiple subjects - create smooth rainbow gradient (top to bottom)
      const gradientStops = subjects.map((subject, idx) => {
        const color = subject?.color || '#3B82F6';
        const start = (idx / subjects.length) * 100;
        const end = ((idx + 1) / subjects.length) * 100;
        return `${color} ${start}%, ${color} ${end}%`;
      }).join(', ');
      
      backgroundStyle = {
        background: `linear-gradient(180deg, ${gradientStops})`,
      };
    }

    return (
      <div 
        className="h-full w-full flex flex-col justify-center items-center text-white relative"
        style={backgroundStyle}
      >
        {/* Double period indicator badge - only show on start */}
        {isDoubleStart && (
          <div className="absolute top-2 right-2 bg-black/40 text-white text-xs px-2 py-1 rounded-md font-bold shadow-lg z-10">
            DOUBLE
          </div>
        )}
        <div className="text-sm font-bold leading-tight text-center px-2">
          {lesson.lessonName}
        </div>
        <div className="text-xs opacity-95 mt-2 text-center px-2">
          {viewMode === 'class' 
            ? lesson.teacherIds?.map(t => t?.name).filter(Boolean).join(', ') || 'No teacher'
            : lesson.classIds?.map(c => c?.name).filter(Boolean).join(', ') || 'No class'
          }
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 mx-auto"></div>
          <p className="mt-4 text-zinc-600">Loading timetable...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-600">School configuration not found</p>
      </div>
    );
  }

  const entityList = viewMode === 'class' ? classes : teachers;
  const selectedName = entityList?.find(e => e._id === selectedEntity)?.name || '';

  // Debug: Log the filtering criteria
  console.log('🎯 Filtering for:', { viewMode, selectedEntity, selectedName, totalSlots: slots.length });
  
  // Count slots for selected entity
  const relevantSlots = slots.filter(slot => 
    viewMode === 'class' 
      ? slot.classId?._id === selectedEntity
      : slot.lessonId?.teacherIds?.some(t => t?._id === selectedEntity)
  );
  console.log('✅ Relevant slots found:', relevantSlots.length);
  if (relevantSlots.length > 0) {
    console.log('📌 Sample relevant slot:', relevantSlots[0]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Timetable
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            View class and teacher schedules
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button
            variant={viewMode === 'class' ? 'default' : 'outline'}
            onClick={() => {
              setViewMode('class');
              if (classes.length > 0) setSelectedEntity(classes[0]._id);
            }}
          >
            <Users className="mr-2 h-4 w-4" />
            By Class
          </Button>
          <Button
            variant={viewMode === 'teacher' ? 'default' : 'outline'}
            onClick={() => {
              setViewMode('teacher');
              if (teachers.length > 0) setSelectedEntity(teachers[0]._id);
            }}
          >
            <User className="mr-2 h-4 w-4" />
            By Teacher
          </Button>
        </div>
      </div>

      {slots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-16 w-16 text-zinc-400 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              No Timetable Generated Yet
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 text-center mb-4">
              Generate your first timetable from the Lessons page
            </p>
            <Button onClick={() => window.location.href = '/dashboard/lessons'}>
              Go to Lessons
            </Button>
          </CardContent>
        </Card>
      ) : relevantSlots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-16 w-16 text-zinc-400 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              No Slots Found for {selectedName}
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 text-center mb-4">
              {slots.length} total slots exist in the database, but none match this {viewMode}.
              <br />
              Try selecting a different {viewMode} or regenerate the timetable.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Entity Selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {viewMode === 'class' ? 'Select Class:' : 'Select Teacher:'}
            </label>
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
            >
              {entityList.map((entity) => (
                <option key={entity._id} value={entity._id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          {/* Timetable Grid */}
          <Card>
            <CardHeader>
              <CardTitle>{selectedName} - Weekly Timetable</CardTitle>
              <CardDescription>
                {config.numberOfPeriods} periods per day • {config.periodDuration} minutes each
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-3 text-left font-semibold">
                        Period
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-3 text-left font-semibold">
                        Time
                      </th>
                      {DAYS.map((day) => (
                        <th
                          key={day}
                          className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-3 text-center font-semibold"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: config.numberOfPeriods }, (_, i) => i + 1).map((period) => {
                      // Check if there's an interval after this period
                      const intervalAfterThisPeriod = config.intervalSlots.find(
                        slot => slot.afterPeriod === period
                      );
                      
                      return (
                        <React.Fragment key={`period-${period}`}>
                          {/* Period Row */}
                          <tr>
                            <td className="border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 font-medium">
                              Period {period}
                            </td>
                            <td className="border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 text-sm text-zinc-600 dark:text-zinc-400">
                              {calculateTime(period)}
                            </td>
                            {DAYS.map((day) => {
                              const slot = getSlotForPeriod(day, period);
                              
                              // Check if this is part of a double period
                              const isDoubleStart = slot?.isDoubleStart || false;
                              const isDoubleEnd = slot?.isDoubleEnd || false;
                              
                              // CRITICAL: Skip rendering if this is the END of a double period
                              // The START period will span 2 rows to cover both periods
                              if (isDoubleEnd) {
                                return null;
                              }
                              
                              // Calculate rowSpan for double periods
                              let rowSpan = 1;
                              if (isDoubleStart) {
                                // Check if there's an interval between the two periods
                                const hasIntervalAfter = config.intervalSlots.some(
                                  slot => slot.afterPeriod === period
                                );
                                // Only span 2 rows if no interval interrupts
                                rowSpan = hasIntervalAfter ? 1 : 2;
                              }
                              
                              return (
                                <td
                                  key={`${day}-${period}`}
                                  rowSpan={rowSpan}
                                  className={`relative overflow-hidden ${
                                    isDoubleStart && rowSpan === 2 ? 'h-40' : 'h-20'
                                  } ${
                                    isDoubleStart 
                                      ? 'border-l-4 border-r-4 border-t-4 border-b-4 border-blue-600 dark:border-blue-400' 
                                      : 'border border-zinc-300 dark:border-zinc-700'
                                  }`}
                                  style={{
                                    minWidth: '150px',
                                  }}
                                >
                                  {renderSlotContent(slot, isDoubleStart)}
                                </td>
                              );
                            })}
                          </tr>
                          
                          {/* Interval Row - appears immediately after the period */}
                          {intervalAfterThisPeriod && (
                            <tr>
                              <td
                                colSpan={2}
                                className="border border-zinc-300 dark:border-zinc-700 bg-yellow-100 dark:bg-yellow-900/30 p-3 text-center font-semibold text-zinc-700 dark:text-zinc-300"
                              >
                                INTERVAL
                              </td>
                              <td
                                colSpan={5}
                                className="border border-zinc-300 dark:border-zinc-700 bg-yellow-100 dark:bg-yellow-900/30 p-3 text-center text-sm text-zinc-600 dark:text-zinc-400"
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
        </>
      )}
    </div>
  );
}
