'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, AlertCircle, Users, User, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Draggable wrapper for unplaced lessons
function DraggableUnplacedLesson({ lesson, unplacedItem }: { lesson: Lesson; unplacedItem: any }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unplaced-${unplacedItem.lessonId}-${unplacedItem.classId}`,
    data: {
      lesson,
      type: 'unplaced-lesson',
      unplacedItem, // Pass the unplaced item data for server action
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'bg-red-50 border border-red-200 rounded-md p-2 cursor-grab active:cursor-grabbing transition-opacity',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-900 truncate">
            {unplacedItem.lessonName}
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">
            {unplacedItem.className} • {unplacedItem.taskType === 'double' ? '2 periods' : '1 period'}
          </div>
        </div>
      </div>
    </div>
  );
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
  day: number | string; // Can be number (1-5) or 'Unscheduled'
  periodNumber: number;
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
  isUnscheduled?: boolean;
}

interface UnscheduledLessonsSidebarProps {
  lessons: Lesson[];
  slots: TimetableSlot[];
  unplacedLessons?: any[]; // Unplaced lessons from version document
  filterByClassId?: string; // Optional: filter by specific class
  filterByTeacherId?: string; // Optional: filter by specific teacher
  showPagination?: boolean; // Optional: enable pagination for master matrix
}

export default function UnscheduledLessonsSidebar({ 
  lessons, 
  slots, 
  unplacedLessons = [],
  filterByClassId,
  filterByTeacherId,
  showPagination = false,
}: UnscheduledLessonsSidebarProps) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;
  
  // Filter unplaced lessons based on context
  const filteredUnplacedLessons = React.useMemo(() => {
    let filtered = unplacedLessons;
    
    // Filter by class if specified
    if (filterByClassId) {
      filtered = filtered.filter(item => item.classId === filterByClassId);
    }
    
    // Filter by teacher if specified (requires matching lesson)
    if (filterByTeacherId) {
      filtered = filtered.filter(item => {
        const lesson = lessons.find(l => l._id === item.lessonId);
        return lesson?.teacherIds?.some((t: any) => t._id === filterByTeacherId);
      });
    }
    
    return filtered;
  }, [unplacedLessons, filterByClassId, filterByTeacherId, lessons]);
  
  // Paginate if enabled
  const paginatedUnplacedLessons = React.useMemo(() => {
    if (!showPagination) return filteredUnplacedLessons;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredUnplacedLessons.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredUnplacedLessons, currentPage, showPagination]);
  
  const totalPages = Math.ceil(filteredUnplacedLessons.length / itemsPerPage);
  
  // Debug logging
  console.log('📋 UnscheduledLessonsSidebar - Lessons:', lessons.length);
  console.log('📋 UnscheduledLessonsSidebar - Scheduled Slots:', slots.length);
  console.log('📋 UnscheduledLessonsSidebar - Total Unplaced:', unplacedLessons.length);
  console.log('📋 UnscheduledLessonsSidebar - Filtered Unplaced:', filteredUnplacedLessons.length);
  
  if (filterByClassId) console.log('🔍 Filtering by class:', filterByClassId);
  if (filterByTeacherId) console.log('🔍 Filtering by teacher:', filterByTeacherId);
  
  // Detect conflicting slots (multiple lessons at same day/period/class)
  // Only check scheduled slots (from TimetableSlot collection)
  const conflictingSlots = useMemo(() => {
    const slotMap = new Map<string, TimetableSlot[]>();
    
    slots.forEach((slot) => {
      const lessonId = typeof slot.lessonId === 'string' ? slot.lessonId : slot.lessonId._id;
      // Skip if lesson data is incomplete
      if (!lessonId) return;
      
      const key = `${slot.day}-${slot.periodNumber}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, []);
      }
      slotMap.get(key)!.push(slot);
    });
    
    // Find slots with conflicts (more than one lesson at same time)
    const conflicts = new Set<string>();
    slotMap.forEach((slotsAtPosition) => {
      if (slotsAtPosition.length > 1) {
        slotsAtPosition.forEach((slot) => {
          const lessonId = typeof slot.lessonId === 'string' ? slot.lessonId : slot.lessonId._id;
          if (lessonId) conflicts.add(lessonId);
        });
      }
    });
    
    console.log('⚠️ Conflicting lessons detected:', conflicts.size);
    return conflicts;
  }, [slots]);
  
  // Calculate which lessons are unscheduled or partially scheduled
  // Now using unplacedLessons from version document for accurate tracking
  const lessonScheduleStatus = useMemo(() => {
    const statusMap = new Map<string, { scheduled: number; needed: number; lesson: Lesson; isConflicting: boolean }>();

    lessons.forEach((lesson) => {
      const periodsNeeded = lesson.isDoubleScheduled ? 2 : (lesson.periodsPerWeek || 1);
      
      // Count how many periods are ACTUALLY scheduled (in TimetableSlot collection)
      const scheduledSlots = slots.filter((slot) => {
        const lessonId = typeof slot.lessonId === 'string' ? slot.lessonId : slot.lessonId._id;
        return lessonId === lesson._id;
      });

      const periodsScheduled = scheduledSlots.length;
      const isConflicting = conflictingSlots.has(lesson._id);

      statusMap.set(lesson._id, {
        scheduled: periodsScheduled,
        needed: periodsNeeded,
        lesson,
        isConflicting,
      });
    });

    return statusMap;
  }, [lessons, slots, conflictingSlots]);

  // Split into Unplaced (no slots) and Conflicting (has slots but conflicts)
  const { unplacedLessons: unplacedByScheduleStatus, conflictingLessons } = useMemo(() => {
    const unplaced: Array<{ lesson: Lesson; scheduled: number; needed: number }> = [];
    const conflicting: Array<{ lesson: Lesson; scheduled: number; needed: number }> = [];

    lessonScheduleStatus.forEach((status) => {
      // Only include lessons that are not fully scheduled
      if (status.scheduled < status.needed) {
        const lessonData = {
          lesson: status.lesson,
          scheduled: status.scheduled,
          needed: status.needed,
        };
        
        if (status.scheduled === 0) {
          // Completely unplaced
          unplaced.push(lessonData);
        } else if (status.isConflicting) {
          // Placed but has conflicts
          conflicting.push(lessonData);
        } else {
          // Partially placed without conflicts (treat as unplaced for missing periods)
          unplaced.push(lessonData);
        }
      }
    });

    return { unplacedLessons: unplaced, conflictingLessons: conflicting };
  }, [lessonScheduleStatus]);

  // Group by class for display
  const groupByClass = (lessonsList: Array<{ lesson: Lesson; scheduled: number; needed: number }>) => {
    const grouped = new Map<string, { className: string; lessons: Array<{ lesson: Lesson; scheduled: number; needed: number }> }>();

    lessonsList.forEach((item) => {
      item.lesson.classIds?.forEach((classObj) => {
        const classKey = classObj._id;
        const className = classObj.name || `Grade ${classObj.grade}`;

        if (!grouped.has(classKey)) {
          grouped.set(classKey, { className, lessons: [] });
        }

        grouped.get(classKey)!.lessons.push(item);
      });
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[1].className.localeCompare(b[1].className))
      .map(([classId, data]) => ({
        classId,
        className: data.className,
        lessons: data.lessons,
        totalPeriodsMissing: data.lessons.reduce((sum, l) => sum + (l.needed - l.scheduled), 0),
      }));
  };

  const unplacedByClass = groupByClass(unplacedByScheduleStatus);
  const conflictingByClass = groupByClass(conflictingLessons);

  const totalUnplacedPeriods = unplacedByClass.reduce((sum, group) => sum + group.totalPeriodsMissing, 0);
  const totalConflictingPeriods = conflictingByClass.reduce((sum, group) => sum + group.totalPeriodsMissing, 0);
  const totalUnscheduledPeriods = totalUnplacedPeriods + totalConflictingPeriods;

  console.log('📊 Total unscheduled periods:', totalUnscheduledPeriods);
  console.log('📊 Unplaced periods:', totalUnplacedPeriods);
  console.log('📊 Conflicting periods:', totalConflictingPeriods);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Unscheduled Lessons</CardTitle>
          <Badge variant="destructive" className="text-xs">
            {totalUnscheduledPeriods} periods
          </Badge>
        </div>
        <CardDescription className="text-xs mt-1">
          {totalUnplacedPeriods} unplaced • {totalConflictingPeriods} conflicting
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-y-auto space-y-4 px-3">
        {/* Unplaced from Solver Section - Direct from Version Document */}
        {filteredUnplacedLessons.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-red-700">
                  Unplaced by Solver ({filteredUnplacedLessons.length})
                </h3>
              </div>
              {showPagination && totalPages > 1 && (
                <div className="text-[10px] text-gray-500">
                  Page {currentPage} of {totalPages}
                </div>
              )}
            </div>
            <div className="space-y-1">
              {paginatedUnplacedLessons.map((unplacedItem, index) => {
                // Find the full lesson object to enable dragging
                const fullLesson = lessons.find(l => l._id === unplacedItem.lessonId);
                if (!fullLesson) return null;
                
                return (
                  <DraggableUnplacedLesson
                    key={`${unplacedItem.lessonId}-${unplacedItem.classId}-${index}`}
                    lesson={fullLesson}
                    unplacedItem={unplacedItem}
                  />
                );
              })}
            </div>
            {showPagination && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3 px-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Unplaced Lessons Section */}
        {unplacedByClass.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold text-red-700">Unplaced ({totalUnplacedPeriods})</h3>
            </div>
            {unplacedByClass.map((group) => (
              <div key={group.classId} className="mb-3">
                <div className="flex items-center justify-between mb-2 px-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-gray-500" />
                    <span className="text-xs font-medium text-gray-700">{group.className}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {group.totalPeriodsMissing}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {group.lessons.map((item) => (
                    <DraggableLessonCard
                      key={item.lesson._id}
                      lesson={item.lesson}
                      scheduled={item.scheduled}
                      needed={item.needed}
                      isConflicting={false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conflicting Lessons Section */}
        {conflictingByClass.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-amber-700">Conflicting ({totalConflictingPeriods})</h3>
            </div>
            {conflictingByClass.map((group) => (
              <div key={group.classId} className="mb-3">
                <div className="flex items-center justify-between mb-2 px-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-gray-500" />
                    <span className="text-xs font-medium text-gray-700">{group.className}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {group.totalPeriodsMissing}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {group.lessons.map((item) => (
                    <DraggableLessonCard
                      key={item.lesson._id}
                      lesson={item.lesson}
                      scheduled={item.scheduled}
                      needed={item.needed}
                      isConflicting={true}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalUnscheduledPeriods === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
            <p className="text-sm font-medium text-green-700">All lessons scheduled!</p>
            <p className="text-xs text-gray-500 mt-1">No conflicts detected</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// DraggableLessonCard component with conflict awareness
function DraggableLessonCard({ 
  lesson, 
  scheduled, 
  needed,
  isConflicting 
}: { 
  lesson: Lesson; 
  scheduled: number; 
  needed: number;
  isConflicting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lesson-card-${lesson._id}`,
    data: {
      type: 'lesson',
      lesson,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const periodsMissing = needed - scheduled;
  const bgColor = lesson.subjectIds?.[0]?.color || '#3B82F6';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative cursor-grab active:cursor-grabbing rounded-lg p-3 border transition-all',
        isDragging ? 'opacity-50 scale-95' : 'opacity-100 scale-100',
        isConflicting ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white',
        'hover:shadow-md hover:border-blue-300'
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: bgColor }}
            />
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              {lesson.lessonName}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate">{lesson.teacherIds?.[0]?.name || 'No teacher'}</span>
            </div>
            {isConflicting && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-300">
                Conflict
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {scheduled}/{needed} scheduled
            </span>
            <Badge variant={isConflicting ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
              {periodsMissing} left
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
