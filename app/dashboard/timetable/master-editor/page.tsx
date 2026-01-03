'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import MasterGrid from './MasterGrid';
import UnscheduledLessonsSidebar from '@/components/dashboard/UnscheduledLessonsSidebar';
import { saveManualMove } from '@/app/actions/saveManualMove';

interface Teacher {
  _id: string;
  name: string;
}

interface Class {
  _id: string;
  name: string;
  grade: number | string;
}

interface Subject {
  _id: string;
  name: string;
  color: string;
}

interface Lesson {
  _id: string;
  lessonName: string;
  subjectIds: Subject[];
  teacherIds: Teacher[];
  classIds: Class[];
  periodsPerWeek?: number;
  isDoubleScheduled?: boolean;
}

interface TimetableSlot {
  _id: string;
  lessonId: Lesson | string;
  classId: string | Class;
  day: number;
  periodNumber: number;
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
}

interface TimetableVersion {
  _id: string;
  versionName: string;
  isSaved: boolean;
}

interface MasterEditorPageProps {
  initialVersionId?: string;
}

export default function MasterEditorPage({ initialVersionId }: MasterEditorPageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string>(initialVersionId || '');
  
  // Drag state
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  // Conflict/Swap dialog state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    lessonId: string;
    targetDay: number;
    targetPeriod: number;
    teacherId: string;
    conflict?: any;
    existingSlotId?: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Drag starts after 8px movement
      },
    })
  );

  useEffect(() => {
    fetchData();
  }, [currentVersionId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch versions
      const versionsRes = await fetch('/api/timetable/versions');
      if (!versionsRes.ok) throw new Error('Failed to fetch versions');
      const versionsData = await versionsRes.json();
      setVersions(versionsData.versions || []);

      // Use current version or get latest draft
      let versionId = currentVersionId;
      if (!versionId && versionsData.versions.length > 0) {
        const latestDraft = versionsData.versions.find((v: TimetableVersion) => !v.isSaved);
        versionId = latestDraft?._id || versionsData.versions[0]._id;
        setCurrentVersionId(versionId);
      }

      // Fetch teachers
      const teachersRes = await fetch('/api/teachers');
      if (!teachersRes.ok) throw new Error('Failed to fetch teachers');
      const teachersData = await teachersRes.json();
      setTeachers(teachersData.teachers || []);

      // Fetch lessons
      const lessonsRes = await fetch('/api/lessons');
      if (!lessonsRes.ok) throw new Error('Failed to fetch lessons');
      const lessonsData = await lessonsRes.json();
      setLessons(lessonsData.lessons || []);

      // Fetch slots for current version
      if (versionId) {
        const slotsRes = await fetch(`/api/timetable?versionId=${versionId}`);
        if (!slotsRes.ok) throw new Error('Failed to fetch slots');
        const slotsData = await slotsRes.json();
        setSlots(slotsData.slots || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    
    if (active.data.current?.type === 'lesson') {
      const lesson = active.data.current.lesson as Lesson;
      setActiveLesson(lesson);
      setActiveLessonId(lesson._id);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveLesson(null);
    setActiveLessonId(null);

    if (!over) return;

    const lessonData = active.data.current?.lesson as Lesson;
    const dropData = over.data.current;

    if (!lessonData || !dropData) return;

    const { day, period, teacherId } = dropData;

    // Validate that the teacher is assigned to this lesson
    const isTeacherMatch = lessonData.teacherIds?.some(t => t._id === teacherId);
    if (!isTeacherMatch) {
      toast.error('This teacher is not assigned to this lesson');
      return;
    }

    // Attempt to save the move
    const result = await saveManualMove({
      lessonId: lessonData._id,
      targetDay: day,
      targetPeriod: period,
      versionId: currentVersionId,
      forcePlace: false,
    });

    if (result.success) {
      toast.success(result.message);
      fetchData(); // Refresh data
    } else if (result.needsSwapConfirmation) {
      // Show conflict/swap dialog
      setConflictData({
        lessonId: lessonData._id,
        targetDay: day,
        targetPeriod: period,
        teacherId,
        conflict: result.conflict,
        existingSlotId: result.existingSlotId,
      });
      setConflictDialogOpen(true);
    } else if (result.conflict) {
      // Show simple conflict error
      toast.error(result.message + ': ' + result.conflict.details);
    } else {
      toast.error(result.message);
    }
  };

  const handleForcePlace = async () => {
    if (!conflictData) return;

    const result = await saveManualMove({
      lessonId: conflictData.lessonId,
      targetDay: conflictData.targetDay,
      targetPeriod: conflictData.targetPeriod,
      versionId: currentVersionId,
      forcePlace: true,
    });

    if (result.success) {
      toast.success('Lesson force-placed (conflict marked for manual resolution)');
      setConflictDialogOpen(false);
      setConflictData(null);
      fetchData();
    } else {
      toast.error(result.message);
    }
  };

  const handleSwap = async () => {
    if (!conflictData || !conflictData.existingSlotId) return;

    const result = await saveManualMove({
      lessonId: conflictData.lessonId,
      targetDay: conflictData.targetDay,
      targetPeriod: conflictData.targetPeriod,
      versionId: currentVersionId,
      swapWithSlotId: conflictData.existingSlotId,
    });

    if (result.success) {
      toast.success('Lessons swapped successfully');
      setConflictDialogOpen(false);
      setConflictData(null);
      fetchData();
    } else {
      toast.error(result.message);
    }
  };

  const currentVersion = versions.find(v => v._id === currentVersionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Master Grid Editor...</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard/timetable')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Timetable
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Master Grid Editor</h1>
              <p className="text-sm text-gray-600">
                {currentVersion?.versionName || 'No version selected'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchData}
            >
              <Save className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Unscheduled Lessons Sidebar */}
          <div className="w-96 border-r bg-white flex-shrink-0 overflow-hidden">
            <UnscheduledLessonsSidebar lessons={lessons} slots={slots} />
          </div>

          {/* Master Grid */}
          <div className="flex-1 overflow-hidden">
            <MasterGrid
              teachers={teachers}
              slots={slots}
              lessons={lessons}
              activeLesson={activeLesson}
            />
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeLessonId && activeLesson && (
            <div className="bg-white border-2 border-blue-500 rounded-lg p-3 shadow-xl opacity-90">
              <div className="font-semibold text-sm">{activeLesson.lessonName}</div>
              <div className="text-xs text-gray-600 mt-1">
                {activeLesson.subjectIds?.[0]?.name || 'Unknown Subject'}
              </div>
            </div>
          )}
        </DragOverlay>

        {/* Conflict/Swap Dialog */}
        <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Conflict Detected
              </DialogTitle>
              <DialogDescription>
                This slot is already occupied. Choose an action:
              </DialogDescription>
            </DialogHeader>
            
            {conflictData?.conflict && (
              <div className="py-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>Conflict Type:</strong> {conflictData.conflict.type}
                  </p>
                  <p className="text-sm text-yellow-800 mt-1">
                    {conflictData.conflict.details}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setConflictDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              {conflictData?.existingSlotId && (
                <Button
                  variant="secondary"
                  onClick={handleSwap}
                  className="w-full sm:w-auto"
                >
                  Swap Positions
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={handleForcePlace}
                className="w-full sm:w-auto"
              >
                Force Place (Mark Conflict)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DndContext>
  );
}
