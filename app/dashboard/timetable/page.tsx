'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, Users, User, Save, History, Trash2 } from 'lucide-react';
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

interface TimetableVersion {
  _id: string;
  versionName: string;
  isSaved: boolean;
  createdAt: string;
  slotCount: number;
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
  
  // Version management state
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string>('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (versionId?: string) => {
    try {
      setLoading(true);
      const timetableUrl = versionId ? `/api/timetable?versionId=${versionId}` : '/api/timetable';
      
      const [slotsRes, classesRes, teachersRes, configRes, versionsRes] = await Promise.all([
        fetch(timetableUrl, { cache: 'no-store' }),
        fetch('/api/classes', { cache: 'no-store' }),
        fetch('/api/teachers', { cache: 'no-store' }),
        fetch('/api/school/config', { cache: 'no-store' }),
        fetch('/api/timetable/versions', { cache: 'no-store' }),
      ]);

      const [slotsData, classesData, teachersData, configData, versionsData] = await Promise.all([
        slotsRes.json(),
        classesRes.json(),
        teachersRes.json(),
        configRes.json(),
        versionsRes.json(),
      ]);

      console.log('🔍 Client: Slots received:', slotsData.data?.length || 0);
      console.log('📦 Client: Version ID:', slotsData.versionId);
      console.log('📦 Client: Sample slot:', slotsData.data?.[0]);
      
      if (slotsData.data?.length === 0) {
        console.warn('⚠️ No slots received from API');
        console.log('API Response:', slotsData);
      }
      
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
      console.log('📚 Client: Versions:', versionsData.data?.length || 0);
      if (versionsData.data?.length > 0) {
        console.log('📚 Versions list:', versionsData.data);
      }

      if (slotsData.success) {
        setSlots(slotsData.data || []);
        if (slotsData.versionId) setCurrentVersionId(slotsData.versionId);
      }
      if (versionsData.success) setVersions(versionsData.data || []);
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

  const handleSaveVersion = async () => {
    if (!newVersionName.trim()) {
      toast.error('Please enter a version name');
      return;
    }

    try {
      setSavingVersion(true);
      const response = await fetch('/api/timetable/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: currentVersionId,
          versionName: newVersionName,
          isSaved: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Version saved successfully!');
        setSaveDialogOpen(false);
        setNewVersionName('');
        await fetchData(currentVersionId);
      } else {
        toast.error(data.error || 'Failed to save version');
      }
    } catch (error) {
      console.error('Error saving version:', error);
      toast.error('Failed to save version');
    } finally {
      setSavingVersion(false);
    }
  };

  const handleSwitchVersion = async (versionId: string) => {
    await fetchData(versionId);
    toast.success('Switched to selected version');
  };

  const handleDeleteVersion = async (versionId: string, versionName: string) => {
    if (!confirm(`Are you sure you want to delete "${versionName}"? This will also delete all associated timetable slots.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/timetable/versions?versionId=${versionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Version deleted successfully');
        await fetchData();
      } else {
        toast.error(data.error || 'Failed to delete version');
      }
    } catch (error) {
      console.error('Error deleting version:', error);
      toast.error('Failed to delete version');
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

  const renderSlotContent = (slot: TimetableSlot | undefined, isDoubleStart: boolean = false, periodNumber?: number) => {
    if (!slot) {
      return <div className="text-xs text-zinc-400 dark:text-zinc-500 italic p-3 font-medium">Free</div>;
    }

    const lesson = slot.lessonId;
    if (!lesson || !lesson.subjectIds || !lesson.teacherIds || !lesson.classIds) {
      return <div className="text-xs text-zinc-400 dark:text-zinc-500 italic p-3 font-medium">Invalid data</div>;
    }

    const subjects = lesson.subjectIds;
    
    // Friendly rounded card styling with diagonal gradients
    let backgroundStyle: React.CSSProperties;
    let textColorClass = 'text-white';
    
    if (subjects.length === 1) {
      const color = subjects[0]?.color || '#3B82F6';
      // Diagonal gradient for all periods (45deg)
      backgroundStyle = {
        background: `linear-gradient(135deg, ${color} 0%, ${color}EE 100%)`,
      };
    } else {
      // Multiple subjects: smooth diagonal gradient
      const gradientStops = subjects.map((subject, idx) => {
        const color = subject?.color || '#3B82F6';
        const start = (idx / subjects.length) * 100;
        const end = ((idx + 1) / subjects.length) * 100;
        return `${color} ${start}%, ${color} ${end}%`;
      }).join(', ');
      
      backgroundStyle = {
        background: `linear-gradient(135deg, ${gradientStops})`,
      };
    }

    return (
      <div 
        className={`h-full w-full rounded-2xl flex flex-col justify-center items-center ${textColorClass} relative shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden`}
        style={backgroundStyle}
      >
        {/* Subtle white overlay for text contrast */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        
        {/* Modern double period badge - glassmorphism */}
        {isDoubleStart && (
          <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-lg border border-white/30 text-white text-[10px] px-2.5 py-1 rounded-full font-bold shadow-lg z-10">
            DOUBLE
          </div>
        )}
        
        <div className="relative z-10 flex flex-col justify-center items-center">
          <div className="text-base font-bold leading-tight text-center px-3 drop-shadow-md">
            {lesson.lessonName}
          </div>
          <div className="text-xs opacity-90 mt-2 text-center font-medium px-3">
            {viewMode === 'class' 
              ? lesson.teacherIds?.map(t => t?.name).filter(Boolean).join(', ') || 'No teacher'
              : lesson.classIds?.map(c => c?.name).filter(Boolean).join(', ') || 'No class'
            }
          </div>
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

      {/* Version Management Section */}
      {slots.length > 0 && versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version Management
            </CardTitle>
            <CardDescription>
              Save, switch between, and manage different timetable versions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Current Version Info */}
              <div className="flex-1">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                  Current Version
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={currentVersionId}
                    onChange={(e) => handleSwitchVersion(e.target.value)}
                    className="flex-1 h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                  >
                    {versions.map((version) => (
                      <option key={version._id} value={version._id}>
                        {version.versionName} {version.isSaved ? '' : '(Draft)'} - {version.slotCount} slots
                      </option>
                    ))}
                  </select>
                  
                  {/* Save Version Button */}
                  {versions.find(v => v._id === currentVersionId)?.isSaved === false && (
                    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="default" size="sm" className="whitespace-nowrap">
                          <Save className="mr-2 h-4 w-4" />
                          Save Version
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Save Timetable Version</DialogTitle>
                          <DialogDescription>
                            Give this version a name to save it permanently. You can generate new drafts without affecting saved versions.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                            Version Name
                          </label>
                          <Input
                            placeholder="e.g., Final Version, Term 1 2026"
                            value={newVersionName}
                            onChange={(e) => setNewVersionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveVersion();
                            }}
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleSaveVersion} disabled={savingVersion}>
                            {savingVersion ? 'Saving...' : 'Save Version'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Saved Versions List */}
              {versions.filter(v => v.isSaved).length > 0 && (
                <div className="flex-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                    Saved Versions ({versions.filter(v => v.isSaved).length})
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-md p-3">
                    {versions.filter(v => v.isSaved).map((version) => (
                      <div
                        key={version._id}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {version.versionName}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVersion(version._id, version.versionName)}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
                      <th className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-left font-bold text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                        Period
                      </th>
                      <th className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-left font-bold text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                        Time
                      </th>
                      {DAYS.map((day) => (
                        <th
                          key={day}
                          className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-center font-bold text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300"
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
                            <td className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-4 font-semibold text-sm text-zinc-700 dark:text-zinc-300">
                              Period {period}
                            </td>
                            <td className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-4 text-sm text-zinc-600 dark:text-zinc-400 font-medium">
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
                                <TooltipProvider key={`${day}-${period}`} delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <td
                                        rowSpan={rowSpan}
                                        className={`relative cursor-pointer transition-all bg-zinc-50 dark:bg-zinc-900 ${
                                          isDoubleStart && rowSpan === 2 ? 'h-40' : 'h-24'
                                        } border border-zinc-100 dark:border-zinc-800 p-2`}
                                        style={{
                                          minWidth: '160px',
                                        }}
                                      >
                                        {renderSlotContent(slot, isDoubleStart, period)}
                                      </td>
                                    </TooltipTrigger>
                                    {slot && (
                                      <TooltipContent side="top" className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-700 dark:border-zinc-300">
                                        <div className="space-y-1">
                                          <div className="font-semibold">{slot.lessonId?.lessonName}</div>
                                          <div className="text-xs">
                                            <span className="opacity-80">Teacher:</span> {slot.lessonId?.teacherIds?.map(t => t?.name).filter(Boolean).join(', ') || 'N/A'}
                                          </div>
                                          <div className="text-xs">
                                            <span className="opacity-80">Class:</span> {slot.lessonId?.classIds?.map(c => c?.name).filter(Boolean).join(', ') || 'N/A'}
                                          </div>
                                          <div className="text-xs">
                                            <span className="opacity-80">Time:</span> {calculateTime(period)} - {calculateTime(period + (isDoubleStart ? 2 : 1))}
                                          </div>
                                        </div>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                          </tr>
                          
                          {/* Interval Row - appears immediately after the period */}
                          {intervalAfterThisPeriod && (
                            <tr className="bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 dark:from-amber-950/20 dark:via-amber-900/30 dark:to-amber-950/20">
                              <td
                                colSpan={2}
                                className="border border-zinc-200 dark:border-zinc-800 p-4 text-center font-bold text-sm uppercase tracking-wider text-amber-700 dark:text-amber-400"
                                style={{
                                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(251, 191, 36, 0.1) 10px, rgba(251, 191, 36, 0.1) 20px)',
                                }}
                              >
                                ☕ INTERVAL
                              </td>
                              <td
                                colSpan={5}
                                className="border border-zinc-200 dark:border-zinc-800 p-4 text-center text-sm text-amber-700 dark:text-amber-400 font-semibold"
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
        </>
      )}
    </div>
  );
}
