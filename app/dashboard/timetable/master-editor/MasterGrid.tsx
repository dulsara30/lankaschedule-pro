'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User, Users, AlertTriangle, CheckCircle2, Search, Minimize2, Maximize2 } from 'lucide-react';

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
  compactMode: boolean;
  isHovered: boolean;
  teacherName?: string;
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
  onClick,
  compactMode,
  isHovered,
  teacherName
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

  // Calculate time display
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeDisplay = `${dayNames[day - 1]} - Period ${period}`;

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'relative border rounded transition-all',
        compactMode ? 'h-12' : 'h-16',
        'hover:shadow-md cursor-pointer',
        slot && !isConflict && 'bg-white',
        slot && isConflict && 'bg-red-50 border-red-300',
        !slot && 'bg-gray-50 border-gray-200',
        isOver && validationResult?.valid && 'bg-green-100 border-green-500 border-2 scale-105 shadow-md',
        isOver && !validationResult?.valid && 'bg-red-100 border-red-500 border-2',
        activeLesson && validationResult?.valid && !isOver && 'border-green-300 border-dashed',
        isHovered && 'ring-2 ring-blue-400 ring-opacity-50 shadow-lg z-10'
      )}
    >
      {slot && lessonData ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "h-full flex flex-col justify-between",
                compactMode ? "p-1" : "p-2"
              )}>
                <div>
                  <div 
                    className={cn(
                      "font-semibold truncate",
                      compactMode ? "text-[10px] mb-0.5" : "text-xs mb-1"
                    )}
                    style={{ color: subject?.color || '#000' }}
                  >
                    {subject?.name || 'Unknown'}
                  </div>
                  <div className={cn(
                    "text-gray-600 truncate",
                    compactMode ? "text-[9px]" : "text-xs"
                  )}>
                    {classes.map(c => c.name || `Grade ${c.grade}`).join(', ')}
                  </div>
                </div>
                {isConflict && (
                  <Badge variant="destructive" className={cn(
                    "absolute top-1 right-1 px-1 py-0",
                    compactMode ? "text-[8px]" : "text-xs"
                  )}>
                    ⚠
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-semibold">{lessonData.lessonName}</p>
                <p className="text-xs">
                  <span className="font-medium">Teacher:</span> {teacherName || 'Unknown'}
                </p>
                <p className="text-xs">
                  <span className="font-medium">Classes:</span> {classes.map(c => c.name || `Grade ${c.grade}`).join(', ')}
                </p>
                <p className="text-xs">
                  <span className="font-medium">Time:</span> {timeDisplay}
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
          'h-full flex items-center justify-center font-medium',
          compactMode ? 'text-[10px]' : 'text-xs',
          validationResult.valid ? 'text-green-700' : 'text-red-700'
        )}>
          {validationResult.valid ? (
            <div className="flex items-center gap-1">
              <CheckCircle2 className={compactMode ? "h-3 w-3" : "h-4 w-4"} />
              <span>Drop</span>
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
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [compactMode, setCompactMode] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);

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

  // Detect conflicts (teacher teaching multiple DIFFERENT classes at same time)
  // CRITICAL: Parallel lessons (same lesson, multiple classes) are NOT conflicts
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
            // Check if all slots are for the SAME lesson (parallel lesson)
            const uniqueLessonIds = new Set(
              slotsAtThisTime.map(slot => {
                const lesson = typeof slot.lessonId === 'string' ? slot.lessonId : slot.lessonId._id;
                return lesson;
              })
            );

            // CONFLICT only if teacher has DIFFERENT lessons at same time
            if (uniqueLessonIds.size > 1) {
              slotsAtThisTime.forEach((slot) => {
                const lesson = typeof slot.lessonId === 'string' 
                  ? lessons.find(l => l._id === slot.lessonId)
                  : slot.lessonId;

                const classes = lesson?.classIds?.map(c => c.name || `Grade ${c.grade}`).join(', ') || 'Unknown';
                conflictMap.set(
                  slot._id,
                  {
                    slot,
                    reason: `Teacher teaching multiple different lessons: ${classes}`,
                  }
                );
              });
            }
            // If uniqueLessonIds.size === 1, it's a parallel lesson (intentional, not a conflict)
          }
        }
      }
    });

    return conflictMap;
  }, [teachers, slots, lessons]);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const periods = Array.from({ length: 10 }, (_, i) => i + 1);

  // Filter teachers based on search query (show ALL 46 teachers by default)
  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teachers;
    
    const query = searchQuery.toLowerCase();
    return teachers.filter(teacher => 
      teacher.name.toLowerCase().includes(query)
    );
  }, [teachers, searchQuery]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Master Matrix - Teacher View</CardTitle>
            <CardDescription className="text-sm mt-1">
              All {teachers.length} Teachers × 50 Periods (Mon-Fri) - Drag lessons from sidebar
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {filteredTeachers.length} / {teachers.length} Teachers
            </Badge>
            <Button
              variant={compactMode ? "default" : "outline"}
              size="sm"
              onClick={() => setCompactMode(!compactMode)}
              className="gap-2"
            >
              {compactMode ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              {compactMode ? 'Expand' : 'Compact'}
            </Button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search teachers by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 px-2"
            >
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full w-full overflow-auto">
          <div className="min-w-max relative">
            {/* Header Row - Sticky with Enhanced Shadow */}
            <div className="sticky top-0 bg-white z-40 border-b-2 border-gray-300 shadow-md">
              <div className="flex">
                {/* Sticky Teacher Column Header */}
                <div className="sticky left-0 z-50 w-56 border-r-4 border-gray-400 bg-gradient-to-br from-gray-100 to-gray-200 p-3 font-bold text-sm shadow-md">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-700" />
                    <span>Teacher Name</span>
                  </div>
                </div>
                
                {/* Day Headers with Period Sub-headers */}
                {days.map((day, dayIndex) => (
                  <div 
                    key={day} 
                    className={cn(
                      "border-r-4",
                      dayIndex < days.length - 1 ? "border-gray-300" : "border-gray-400"
                    )}
                  >
                    {/* Day Name Header */}
                    <div className={cn(
                      "text-center font-bold border-b-2 shadow-sm",
                      compactMode ? "py-1.5 text-xs" : "py-2 text-sm",
                      dayIndex % 2 === 0 ? "bg-blue-100 text-blue-900" : "bg-indigo-100 text-indigo-900"
                    )}>
                      {day}
                    </div>
                    
                    {/* Period Numbers */}
                    <div className="flex">
                      {periods.map((period) => (
                        <div 
                          key={`${day}-${period}`}
                          onMouseEnter={() => setHoveredColumn(`${dayIndex}-${period}`)}
                          onMouseLeave={() => setHoveredColumn(null)}
                          className={cn(
                            "border-r border-gray-200 text-center font-medium transition-colors",
                            compactMode ? "w-20 text-[10px] py-0.5" : "w-24 text-xs py-1",
                            hoveredColumn === `${dayIndex}-${period}` && "bg-blue-200 text-blue-900",
                            dayIndex % 2 === 0 ? "bg-blue-50 text-gray-700" : "bg-indigo-50 text-gray-700"
                          )}
                        >
                          P{period}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Teacher Rows with Hover Effects */}
            <div>
              {filteredTeachers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Search className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="font-medium">No teachers found</p>
                  <p className="text-sm">Try adjusting your search query</p>
                </div>
              ) : (
                filteredTeachers.map((teacher, teacherIndex) => (
                  <div 
                    key={teacher._id} 
                    onMouseEnter={() => setHoveredRow(teacher._id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className={cn(
                      "flex border-b transition-colors",
                      hoveredRow === teacher._id && "bg-blue-50",
                      teacherIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
                    )}
                  >
                    {/* Sticky Teacher Name Column with Enhanced Shadow */}
                    <div className={cn(
                      "sticky left-0 z-30 w-56 border-r-4 border-gray-400 flex items-center shadow-lg transition-all",
                      compactMode ? "p-2" : "p-3",
                      hoveredRow === teacher._id ? "bg-blue-100" : teacherIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
                    )}>
                      <div className="flex items-center gap-2 w-full">
                        <User className={cn(
                          "text-gray-500",
                          compactMode ? "h-3 w-3" : "h-4 w-4"
                        )} />
                        <span className={cn(
                          "font-medium truncate",
                          compactMode ? "text-xs" : "text-sm"
                        )}>
                          {teacher.name}
                        </span>
                      </div>
                    </div>
                    
                    {/* Day Columns with Visual Separators */}
                    {days.map((day, dayIndex) => (
                      <div 
                        key={day} 
                        className={cn(
                          "flex border-r-4",
                          dayIndex < days.length - 1 ? "border-gray-300" : "border-gray-400",
                          dayIndex % 2 === 0 ? "bg-blue-50/30" : "bg-indigo-50/30"
                        )}
                      >
                        {/* Period Cells */}
                        {periods.map((period) => {
                          const slotKey = `${teacher._id}-${dayIndex + 1}-${period}`;
                          const slot = slotsByTeacherDayPeriod.get(slotKey) || null;
                          const isConflict = slot ? conflicts.has(slot._id) : false;
                          const conflictReason = (isConflict && slot) ? conflicts.get(slot._id)?.reason : undefined;
                          const isHovered = hoveredRow === teacher._id || hoveredColumn === `${dayIndex}-${period}`;

                          return (
                            <div 
                              key={period} 
                              className={cn(
                                "border-r border-gray-200",
                                compactMode ? "w-20 p-0.5" : "w-24 p-1"
                              )}
                            >
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
                                compactMode={compactMode}
                                isHovered={isHovered}
                                teacherName={teacher.name}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
