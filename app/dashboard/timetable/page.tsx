'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar, Users, User, Save, History, Trash2, Check, ChevronsUpDown, ChevronDown, ChevronUp, Download, RotateCcw, FileDown, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { pdf } from '@react-pdf/renderer';
import TimetablePDF from '@/components/timetable/TimetablePDF';

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFViewer),
  { ssr: false }
);

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
  const [entityComboOpen, setEntityComboOpen] = useState(false);
  
  // Version management state
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string>('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [isVersionManagerExpanded, setIsVersionManagerExpanded] = useState(false);

  // PDF Export state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [lessonNameMap, setLessonNameMap] = useState<Record<string, string>>({});
  const [exportType, setExportType] = useState<'single' | 'bulk' | 'teacher'>('single');
  const [exportEntityId, setExportEntityId] = useState<string>('');
  const [exportEntityComboOpen, setExportEntityComboOpen] = useState(false);

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
        
        // Initialize lesson name map for PDF export
        const uniqueLessons = new Map<string, string>();
        (slotsData.data || []).forEach((slot: TimetableSlot) => {
          if (slot.lessonId && slot.lessonId._id && slot.lessonId.lessonName) {
            uniqueLessons.set(slot.lessonId._id, slot.lessonId.lessonName);
          }
        });
        
        // Only update if we have lessons and the map is empty or has changed
        const newMap: Record<string, string> = {};
        uniqueLessons.forEach((name, id) => {
          newMap[id] = lessonNameMap[id] || name; // Preserve existing custom names
        });
        setLessonNameMap(newMap);
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

  // PDF Export helper functions
  const getUniqueLessons = (): Array<{ id: string; originalName: string; displayName: string }> => {
    const lessonsMap = new Map<string, { originalName: string; displayName: string }>();
    
    slots.forEach((slot) => {
      if (slot.lessonId && slot.lessonId._id && slot.lessonId.lessonName) {
        const lessonId = slot.lessonId._id;
        if (!lessonsMap.has(lessonId)) {
          lessonsMap.set(lessonId, {
            originalName: slot.lessonId.lessonName,
            displayName: lessonNameMap[lessonId] || slot.lessonId.lessonName,
          });
        }
      }
    });

    return Array.from(lessonsMap.entries()).map(([id, data]) => ({
      id,
      originalName: data.originalName,
      displayName: data.displayName,
    })).sort((a, b) => a.originalName.localeCompare(b.originalName));
  };

  const updateLessonDisplayName = (lessonId: string, newName: string) => {
    setLessonNameMap(prev => ({
      ...prev,
      [lessonId]: newName,
    }));
  };

  const resetLessonDisplayNames = () => {
    const resetMap: Record<string, string> = {};
    slots.forEach((slot) => {
      if (slot.lessonId && slot.lessonId._id && slot.lessonId.lessonName) {
        resetMap[slot.lessonId._id] = slot.lessonId.lessonName;
      }
    });
    setLessonNameMap(resetMap);
    toast.success('Reset all lesson names to defaults');
  };

  const handleOpenDownloadDialog = () => {
    // Set default export entity based on current selection
    if (exportType === 'single' || exportType === 'teacher') {
      setExportEntityId(selectedEntity);
    }
    setDownloadDialogOpen(true);
  };

  const handleDownloadPDF = async () => {
    try {
      toast.info('Generating PDF...');

      // Determine entity name and filtered slots based on export type
      let entityName = '';
      let filteredSlots = slots;
      let pdfType: 'class' | 'teacher' = exportType === 'teacher' ? 'teacher' : 'class';

      if (exportType === 'single') {
        const classEntity = classes.find(c => c._id === exportEntityId);
        entityName = classEntity?.name || 'Unknown Class';
        filteredSlots = slots.filter(slot => slot.classId?._id === exportEntityId);
      } else if (exportType === 'teacher') {
        const teacherEntity = teachers.find(t => t._id === exportEntityId);
        entityName = teacherEntity?.name || 'Unknown Teacher';
        filteredSlots = slots.filter(slot => 
          slot.lessonId?.teacherIds?.some((t: Teacher) => t._id === exportEntityId)
        );
      } else {
        // Bulk export - we'll generate for all classes
        toast.error('Bulk export feature coming soon!');
        return;
      }

      const versionName = versions.find(v => v._id === currentVersionId)?.versionName || 'Current Version';

      const blob = await pdf(
        <TimetablePDF
          type={pdfType}
          entityName={entityName}
          versionName={versionName}
          slots={filteredSlots}
          config={config!}
          lessonNameMap={lessonNameMap}
          schoolName="LankaSchedule Pro"
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Timetable_${entityName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
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
            variant="outline"
            onClick={handleOpenDownloadDialog}
            disabled={slots.length === 0 || !config}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
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

      {/* Version Management Section - Collapsible */}
      {slots.length > 0 && versions.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setIsVersionManagerExpanded(!isVersionManagerExpanded)}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Version Management
                </CardTitle>
                <CardDescription>
                  Save, switch between, and manage different timetable versions
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isVersionManagerExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </Button>
            </div>
          </CardHeader>
          {isVersionManagerExpanded && (
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
          )}
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
          {/* Entity Selector - Searchable Combobox */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {viewMode === 'class' ? 'Select Class:' : 'Select Teacher:'}
            </label>
            <Popover open={entityComboOpen} onOpenChange={setEntityComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={entityComboOpen}
                  className="w-[300px] justify-between"
                >
                  {selectedEntity
                    ? entityList.find((entity) => entity._id === selectedEntity)?.name
                    : `Search ${viewMode === 'class' ? 'classes' : 'teachers'}...`}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder={`Search ${viewMode === 'class' ? 'class' : 'teacher'}...`} />
                  <CommandList>
                    <CommandEmpty>No {viewMode === 'class' ? 'class' : 'teacher'} found.</CommandEmpty>
                    <CommandGroup>
                      {entityList.map((entity) => {
                        const entityAsClass = entity as Class;
                        return (
                          <CommandItem
                            key={entity._id}
                            value={entity.name}
                            onSelect={() => {
                              setSelectedEntity(entity._id);
                              setEntityComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedEntity === entity._id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {entity.name}
                            {viewMode === 'class' && entityAsClass.grade && (
                              <span className="ml-auto text-xs text-zinc-500">Grade {entityAsClass.grade}</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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

      {/* Download Settings Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Download PDF Settings</DialogTitle>
            <DialogDescription>
              Customize lesson names and select what to export
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Export Type Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Export Type
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant={exportType === 'single' ? 'default' : 'outline'}
                  onClick={() => setExportType('single')}
                  className="w-full"
                >
                  <Users className="mr-2 h-4 w-4" />
                  Single Class
                </Button>
                <Button
                  variant={exportType === 'teacher' ? 'default' : 'outline'}
                  onClick={() => setExportType('teacher')}
                  className="w-full"
                >
                  <User className="mr-2 h-4 w-4" />
                  Teacher View
                </Button>
                <Button
                  variant={exportType === 'bulk' ? 'default' : 'outline'}
                  onClick={() => setExportType('bulk')}
                  className="w-full"
                  disabled
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  All Classes (Soon)
                </Button>
              </div>
            </div>

            {/* Entity Selection */}
            {(exportType === 'single' || exportType === 'teacher') && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {exportType === 'single' ? 'Select Class' : 'Select Teacher'}
                </label>
                <Popover open={exportEntityComboOpen} onOpenChange={setExportEntityComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={exportEntityComboOpen}
                      className="w-full justify-between"
                    >
                      {exportEntityId
                        ? exportType === 'single'
                          ? classes.find((c) => c._id === exportEntityId)?.name
                          : teachers.find((t) => t._id === exportEntityId)?.name
                        : `Select ${exportType === 'single' ? 'class' : 'teacher'}...`}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder={`Search ${exportType === 'single' ? 'class' : 'teacher'}...`} />
                      <CommandList>
                        <CommandEmpty>No {exportType === 'single' ? 'class' : 'teacher'} found.</CommandEmpty>
                        <CommandGroup>
                          {(exportType === 'single' ? classes : teachers).map((entity) => (
                            <CommandItem
                              key={entity._id}
                              value={entity.name}
                              onSelect={() => {
                                setExportEntityId(entity._id);
                                setExportEntityComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  exportEntityId === entity._id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {entity.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Lesson Name Mapping */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Customize Lesson Names (for PDF only)
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetLessonDisplayNames}
                  className="text-xs"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset All
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-md p-3">
                {getUniqueLessons().map((lesson) => (
                  <div key={lesson.id} className="space-y-1">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">
                      Original: {lesson.originalName}
                    </label>
                    <Input
                      value={lesson.displayName}
                      onChange={(e) => updateLessonDisplayName(lesson.id, e.target.value)}
                      placeholder="Display name..."
                      className="h-9 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* PDF Preview */}
            {exportEntityId && config && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  PDF Preview
                </label>
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                  <PDFViewer width="100%" height="500px">
                    <TimetablePDF
                      type={exportType === 'teacher' ? 'teacher' : 'class'}
                      entityName={
                        exportType === 'single'
                          ? classes.find(c => c._id === exportEntityId)?.name || 'Unknown'
                          : teachers.find(t => t._id === exportEntityId)?.name || 'Unknown'
                      }
                      versionName={versions.find(v => v._id === currentVersionId)?.versionName || 'Current Version'}
                      slots={
                        exportType === 'single'
                          ? slots.filter(slot => slot.classId?._id === exportEntityId)
                          : slots.filter(slot => 
                              slot.lessonId?.teacherIds?.some((t: Teacher) => t._id === exportEntityId)
                            )
                      }
                      config={config}
                      lessonNameMap={lessonNameMap}
                      schoolName="LankaSchedule Pro"
                    />
                  </PDFViewer>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleDownloadPDF}
              disabled={!exportEntityId || !config}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
