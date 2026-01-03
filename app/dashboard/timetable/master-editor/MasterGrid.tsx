'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

interface MasterGridProps {
  teachers: Teacher[];
  slots: TimetableSlot[];
  lessons: Lesson[];
  activeLesson: Lesson | null;
  onSlotClick?: (slot: TimetableSlot | null, day: number, period: number, teacher: Teacher) => void;
}

interface DroppableSlotProps {
  slotId: string;
  day: number;
  period: number;
  teacherId: string;
  slot: TimetableSlot | null;
  isConflict: boolean;
  conflictReason?: string;
  activeLesson: Lesson | null;
  lessons: Lesson[];
  onClick?: () => void;
}

function DroppableSlot({ 
  slotId, 
  day, 
  period, 
  teacherId, 
  slot, 
  isConflict, 
  conflictReason,
  activeLesson,
  lessons,
  onClick 
}: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: slotId,
    data: {
      day,
      period,
      teacherId,
      accepts: ['lesson'],
    },
  });

  // Get lesson data
  const lessonData = useMemo(() => {
    if (!slot) return null;
    
    const lessonId = typeof slot.lessonId === 'string' ? slot.lessonId : slot.lessonId._id;
    const lesson = lessons.find(l => l._id === lessonId) || (typeof slot.lessonId !== 'string' ? slot.lessonId : null);
    
    return lesson;
  }, [slot, lessons]);

  // AI Validation: Check if active lesson can be placed here
  const validationResult = useMemo(() => {
    if (!activeLesson) return null;

    // Check if teacher is one of the lesson's teachers
    const isTeacherMatch = activeLesson.teacherIds?.some(t => t._id === teacherId);
    if (!isTeacherMatch) {
      return {
        valid: false,
        reason: 'Teacher not assigned to this lesson',
      };
    }

    // Check if slot is occupied
    if (slot) {
      return {
        valid: false,
        reason: 'Slot occupied (drop to swap)',
        canSwap: true,
      };
    }

    // Check for class conflicts (would need to check all slots at this day/period)
    return {
      valid: true,
      reason: 'Valid placement',
    };
  }, [activeLesson, teacherId, slot]);

  const subject = lessonData?.subjectIds?.[0];
  const classes = lessonData?.classIds || [];

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'relative h-16 border rounded transition-all',
        'hover:shadow-sm cursor-pointer',
        slot && !isConflict && 'bg-white',
        slot && isConflict && 'bg-red-50 border-red-300',
        !slot && 'bg-gray-50 border-gray-200',
        isOver && validationResult?.valid && 'bg-green-100 border-green-500 border-2 scale-105 shadow-md',
        isOver && !validationResult?.valid && 'bg-red-100 border-red-500 border-2',
        activeLesson && validationResult?.valid && !isOver && 'border-green-300 border-dashed'
      )}
    >
      {slot && lessonData ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-2 h-full flex flex-col justify-between">
                <div>
                  <div 
                    className="text-xs font-semibold truncate mb-1"
                    style={{ color: subject?.color || '#000' }}
                  >
                    {subject?.name || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-600 truncate">
                    {classes.map(c => c.name || `Grade ${c.grade}`).join(', ')}
                  </div>
                </div>
                {isConflict && (
                  <Badge variant="destructive" className="absolute top-1 right-1 text-xs px-1 py-0">
                    ⚠
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-semibold">{lessonData.lessonName}</p>
                <p className="text-xs">
                  <span className="font-medium">Teachers:</span> {lessonData.teacherIds?.map(t => t.name).join(', ')}
                </p>
                <p className="text-xs">
                  <span className="font-medium">Classes:</span> {classes.map(c => c.name || `Grade ${c.grade}`).join(', ')}
                </p>
                {isConflict && conflictReason && (
                  <p className="text-xs text-red-600 mt-2">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    {conflictReason}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : isOver && validationResult ? (
        <div className={cn(
          'p-2 h-full flex items-center justify-center text-xs font-medium',
          validationResult.valid ? 'text-green-700' : 'text-red-700'
        )}>
          {validationResult.valid ? (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              <span>Drop to place</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-center">{validationResult.reason}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function MasterGrid({ 
  teachers, 
  slots, 
  lessons, 
  activeLesson,
  onSlotClick 
}: MasterGridProps) {
  const [showAllTeachers, setShowAllTeachers] = useState(false);

  // Organize slots by teacher, day, and period
  const slotsByTeacherDayPeriod = useMemo(() => {
    const map = new Map<string, TimetableSlot>();

    slots.forEach((slot) => {
      const lesson = typeof slot.lessonId === 'string' 
        ? lessons.find(l => l._id === slot.lessonId)
        : slot.lessonId;

      if (!lesson || !lesson.teacherIds) return;

      lesson.teacherIds.forEach((teacher) => {
        const key = `${teacher._id}-${slot.day}-${slot.periodNumber}`;
        map.set(key, slot);
      });
    });

    return map;
  }, [slots, lessons]);

  // Detect conflicts (teacher teaching multiple classes at same time)
  const conflicts = useMemo(() => {
    const conflictMap = new Map<string, { slot: TimetableSlot; reason: string }>();

    teachers.forEach((teacher) => {
      for (let day = 1; day <= 5; day++) {
        for (let period = 1; period <= 10; period++) {
          const slotsAtThisTime = slots.filter((slot) => {
            const lesson = typeof slot.lessonId === 'string' 
              ? lessons.find(l => l._id === slot.lessonId)
              : slot.lessonId;

            if (!lesson || !lesson.teacherIds) return false;

            return (
              slot.day === day &&
              slot.periodNumber === period &&
              lesson.teacherIds.some(t => t._id === teacher._id)
            );
          });

          if (slotsAtThisTime.length > 1) {
            slotsAtThisTime.forEach((slot) => {
              const lesson = typeof slot.lessonId === 'string' 
                ? lessons.find(l => l._id === slot.lessonId)
                : slot.lessonId;

              const classes = lesson?.classIds?.map(c => c.name || `Grade ${c.grade}`).join(', ') || 'Unknown';
              conflictMap.set(
                slot._id,
                {
                  slot,
                  reason: `Teacher teaching multiple classes: ${classes}`,
                }
              );
            });
          }
        }
      }
    });

    return conflictMap;
  }, [teachers, slots, lessons]);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const periods = Array.from({ length: 10 }, (_, i) => i + 1);

  // Filter teachers if not showing all
  const displayedTeachers = showAllTeachers ? teachers : teachers.slice(0, 15);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Master Matrix - Teacher View</CardTitle>
            <CardDescription className="text-sm mt-1">
              Teachers × Periods (All 5 Days) - Drag lessons from sidebar
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {teachers.length} Teachers
            </Badge>
            {teachers.length > 15 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllTeachers(!showAllTeachers)}
              >
                {showAllTeachers ? 'Show Less' : `Show All (${teachers.length})`}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full w-full">
          <div className="min-w-max">
            {/* Header Row */}
            <div className="sticky top-0 bg-white z-20 border-b-2">
              <div className="flex">
                <div className="w-48 flex-shrink-0 border-r-2 bg-gray-50 p-2 font-semibold text-sm">
                  Teacher
                </div>
                {days.map((day, dayIndex) => (
                  <div key={day} className="border-r-2">
                    <div className="bg-blue-50 text-center py-1 border-b font-semibold text-sm">
                      {day}
                    </div>
                    <div className="flex">
                      {periods.map((period) => (
                        <div 
                          key={`${day}-${period}`}
                          className="w-24 border-r border-gray-200 text-center text-xs py-1 font-medium text-gray-600"
                        >
                          P{period}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Teacher Rows */}
            <div>
              {displayedTeachers.map((teacher) => (
                <div key={teacher._id} className="flex border-b hover:bg-gray-50">
                  <div className="w-48 flex-shrink-0 border-r-2 p-2 flex items-center">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium truncate">{teacher.name}</span>
                    </div>
                  </div>
                  {days.map((day, dayIndex) => (
                    <div key={day} className="flex border-r-2">
                      {periods.map((period) => {
                        const slotKey = `${teacher._id}-${dayIndex + 1}-${period}`;
                        const slot = slotsByTeacherDayPeriod.get(slotKey) || null;
                        const isConflict = slot ? conflicts.has(slot._id) : false;
                        const conflictReason = (isConflict && slot) ? conflicts.get(slot._id)?.reason : undefined;

                        return (
                          <div key={period} className="w-24 border-r border-gray-200 p-1">
                            <DroppableSlot
                              slotId={slotKey}
                              day={dayIndex + 1}
                              period={period}
                              teacherId={teacher._id}
                              slot={slot}
                              isConflict={isConflict}
                              conflictReason={conflictReason}
                              activeLesson={activeLesson}
                              lessons={lessons}
                              onClick={() => onSlotClick?.(slot, dayIndex + 1, period, teacher)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
