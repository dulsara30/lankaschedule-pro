'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, AlertCircle, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  day: number;
  periodNumber: number;
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
}

interface UnscheduledLessonsSidebarProps {
  lessons: Lesson[];
  slots: TimetableSlot[];
}

interface DraggableLessonCardProps {
  lesson: Lesson;
  periodsNeeded: number;
  periodsScheduled: number;
}

function DraggableLessonCard({ lesson, periodsNeeded, periodsScheduled }: DraggableLessonCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lesson-${lesson._id}`,
    data: {
      type: 'lesson',
      lesson,
    },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const subject = lesson.subjectIds?.[0];
  const teachers = lesson.teacherIds || [];
  const classes = lesson.classIds || [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white border-2 rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing transition-all',
        isDragging ? 'opacity-50 scale-95 border-blue-500' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GripVertical className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm truncate">{lesson.lessonName}</h4>
              {periodsNeeded === 2 && (
                <Badge variant="outline" className="text-xs">Double</Badge>
              )}
            </div>
            
            {subject && (
              <div 
                className="text-xs font-medium px-2 py-0.5 rounded-full inline-block mb-1"
                style={{ 
                  backgroundColor: `${subject.color}20`,
                  color: subject.color 
                }}
              >
                {subject.name}
              </div>
            )}

            {teachers.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-600 mb-0.5">
                <User className="h-3 w-3" />
                <span className="truncate">{teachers.map(t => t.name).join(', ')}</span>
              </div>
            )}

            {classes.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Users className="h-3 w-3" />
                <span className="truncate">{classes.map(c => c.name || `Grade ${c.grade}`).join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge 
            variant={periodsScheduled === 0 ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {periodsScheduled}/{periodsNeeded}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function UnscheduledLessonsSidebar({ lessons, slots }: UnscheduledLessonsSidebarProps) {
  // Debug logging
  console.log('📋 UnscheduledLessonsSidebar - Lessons:', lessons.length);
  console.log('📋 UnscheduledLessonsSidebar - Slots:', slots.length);
  
  // Calculate which lessons are unscheduled or partially scheduled
  const lessonScheduleStatus = useMemo(() => {
    const statusMap = new Map<string, { scheduled: number; needed: number; lesson: Lesson }>();

    lessons.forEach((lesson) => {
      const periodsNeeded = lesson.isDoubleScheduled ? 2 : (lesson.periodsPerWeek || 1);
      
      // Count how many periods are scheduled for this lesson
      const scheduledSlots = slots.filter((slot) => {
        const lessonId = typeof slot.lessonId === 'string' ? slot.lessonId : slot.lessonId._id;
        return lessonId === lesson._id;
      });

      const periodsScheduled = scheduledSlots.length;

      statusMap.set(lesson._id, {
        scheduled: periodsScheduled,
        needed: periodsNeeded,
        lesson,
      });
    });

    return statusMap;
  }, [lessons, slots]);

  // Group unscheduled/partial lessons by class
  const lessonsByClass = useMemo(() => {
    const grouped = new Map<string, { className: string; lessons: Array<{ lesson: Lesson; scheduled: number; needed: number }> }>();

    lessonScheduleStatus.forEach((status) => {
      // Only include lessons that are not fully scheduled
      if (status.scheduled < status.needed) {
        status.lesson.classIds?.forEach((classObj) => {
          const classKey = classObj._id;
          const className = classObj.name || `Grade ${classObj.grade}`;

          if (!grouped.has(classKey)) {
            grouped.set(classKey, { className, lessons: [] });
          }

          grouped.get(classKey)!.lessons.push({
            lesson: status.lesson,
            scheduled: status.scheduled,
            needed: status.needed,
          });
        });
      }
    });

    // Sort classes by name
    return Array.from(grouped.entries())
      .sort((a, b) => a[1].className.localeCompare(b[1].className))
      .map(([classId, data]) => ({
        classId,
        className: data.className,
        lessons: data.lessons,
        totalPeriodsMissing: data.lessons.reduce((sum, l) => sum + (l.needed - l.scheduled), 0),
      }));
  }, [lessonScheduleStatus]);

  const totalUnscheduledPeriods = lessonsByClass.reduce((sum, group) => sum + group.totalPeriodsMissing, 0);

  console.log('📊 Total unscheduled periods:', totalUnscheduledPeriods);
  console.log('📊 Lessons by class:', lessonsByClass.length);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Unscheduled Lessons</CardTitle>
            <CardDescription className="text-sm mt-1">
              Drag lessons to the Master Grid
            </CardDescription>
          </div>
          {totalUnscheduledPeriods > 0 && (
            <Badge variant="destructive" className="text-lg px-3 py-1">
              {totalUnscheduledPeriods}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 pb-4">
          {lessonsByClass.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-green-100 rounded-full p-3 mb-3">
                <AlertCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">All Lessons Scheduled!</h3>
              <p className="text-sm text-gray-600">
                Every lesson has been placed in the timetable.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {lessonsByClass.map((classGroup) => (
                <div key={classGroup.classId}>
                  <div className="flex items-center justify-between mb-3 sticky top-0 bg-white py-2 z-10">
                    <h3 className="font-semibold text-sm text-gray-900">{classGroup.className}</h3>
                    <Badge variant="outline" className="text-xs">
                      {classGroup.totalPeriodsMissing} periods left
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {classGroup.lessons.map((lessonData) => (
                      <DraggableLessonCard
                        key={lessonData.lesson._id}
                        lesson={lessonData.lesson}
                        periodsNeeded={lessonData.needed}
                        periodsScheduled={lessonData.scheduled}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
