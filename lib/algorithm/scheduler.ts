/**
 * LankaSchedule Pro AI Engine - Constraint Satisfaction Algorithm
 * 
 * Implements backtracking with heuristics to generate clash-free timetables
 * for Sri Lankan schools following 2026 education reforms.
 */

import mongoose from 'mongoose';

// Types
export interface ScheduleLesson {
  _id: string;
  lessonName: string;
  subjectIds: string[];
  teacherIds: string[];
  classIds: string[];
  numberOfSingles: number;
  numberOfDoubles: number;
  color?: string;
}

export interface ScheduleClass {
  _id: string;
  name: string;
  grade: number | string;
}

export interface TimetableSlot {
  classId: string;
  lessonId: string;
  day: string;
  periodNumber: number;
  isDoublePeriod?: boolean;
}

export interface ScheduleConfig {
  numberOfPeriods: number; // e.g., 7
  intervalAfterPeriod: number; // e.g., 3 (interval after period 3)
  daysOfWeek: string[]; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
}

export interface ScheduleResult {
  success: boolean;
  slots: TimetableSlot[];
  failedLessons: {
    lesson: ScheduleLesson;
    reason: string;
  }[];
  stats: {
    totalSlots: number;
    scheduledLessons: number;
    failedLessons: number;
    recursions: number;
  };
}

// Grid representation: Map<"classId-day-period", lessonId>
type TimetableGrid = Map<string, string>;

// Busy tracking: Map<"teacherId-day-period" | "classId-day-period", boolean>
type BusyMap = Map<string, boolean>;

const MAX_RECURSIONS = 50000;
let recursionCount = 0;

/**
 * Main scheduling function
 */
export function generateTimetable(
  lessons: ScheduleLesson[],
  classes: ScheduleClass[],
  config: ScheduleConfig
): ScheduleResult {
  recursionCount = 0;
  const grid: TimetableGrid = new Map();
  const busyMap: BusyMap = new Map();
  const scheduledLessons = new Set<string>();
  const failedLessons: { lesson: ScheduleLesson; reason: string }[] = [];

  // Sort lessons by constraint difficulty (most constrained first)
  const sortedLessons = sortByConstraints(lessons);

  // Expand lessons into individual scheduling tasks
  const tasks = expandLessonsToTasks(sortedLessons);

  // Run backtracking algorithm
  const success = backtrack(tasks, 0, grid, busyMap, scheduledLessons, config);

  // Convert grid to slots array
  const slots = gridToSlots(grid);

  // Identify failed lessons
  for (const lesson of lessons) {
    if (!scheduledLessons.has(lesson._id)) {
      failedLessons.push({
        lesson,
        reason: 'Could not find valid slots without clashes',
      });
    }
  }

  return {
    success,
    slots,
    failedLessons,
    stats: {
      totalSlots: slots.length,
      scheduledLessons: scheduledLessons.size,
      failedLessons: failedLessons.length,
      recursions: recursionCount,
    },
  };
}

/**
 * Sort lessons by difficulty (most constrained first)
 * Heuristic: Lessons with more classes/teachers are harder to schedule
 */
function sortByConstraints(lessons: ScheduleLesson[]): ScheduleLesson[] {
  return [...lessons].sort((a, b) => {
    const scoreA = (a.classIds.length * 2) + a.teacherIds.length;
    const scoreB = (b.classIds.length * 2) + b.teacherIds.length;
    return scoreB - scoreA; // Descending order
  });
}

/**
 * Expand lessons into individual tasks
 * E.g., a lesson with 2 singles + 1 double becomes 3 tasks
 */
interface ScheduleTask {
  lesson: ScheduleLesson;
  isDouble: boolean;
  taskId: string;
}

function expandLessonsToTasks(lessons: ScheduleLesson[]): ScheduleTask[] {
  const tasks: ScheduleTask[] = [];
  
  for (const lesson of lessons) {
    // Add single period tasks
    for (let i = 0; i < lesson.numberOfSingles; i++) {
      tasks.push({
        lesson,
        isDouble: false,
        taskId: `${lesson._id}-single-${i}`,
      });
    }
    
    // Add double period tasks
    for (let i = 0; i < lesson.numberOfDoubles; i++) {
      tasks.push({
        lesson,
        isDouble: true,
        taskId: `${lesson._id}-double-${i}`,
      });
    }
  }
  
  return tasks;
}

/**
 * Backtracking algorithm with recursion limit
 */
function backtrack(
  tasks: ScheduleTask[],
  taskIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  scheduledLessons: Set<string>,
  config: ScheduleConfig
): boolean {
  // Check recursion limit
  recursionCount++;
  if (recursionCount >= MAX_RECURSIONS) {
    return false; // Timeout - return partial solution
  }

  // Base case: all tasks scheduled
  if (taskIndex >= tasks.length) {
    return true;
  }

  const task = tasks[taskIndex];
  const { lesson, isDouble } = task;

  // Get all valid slots for this task (MRV heuristic)
  const validSlots = findValidSlots(lesson, isDouble, grid, busyMap, config);

  // Try each valid slot
  for (const slot of validSlots) {
    // Place lesson in slot(s)
    const changes = placeLesson(lesson, slot, isDouble, grid, busyMap);

    // Recurse to next task
    if (backtrack(tasks, taskIndex + 1, grid, busyMap, scheduledLessons, config)) {
      scheduledLessons.add(lesson._id);
      return true;
    }

    // Backtrack: undo changes
    undoChanges(changes, grid, busyMap);
  }

  // No valid slot found for this task
  return false;
}

/**
 * Find all valid slots for a lesson
 * Returns array of {day, period} that satisfy all constraints
 */
interface SlotPosition {
  day: string;
  period: number;
}

function findValidSlots(
  lesson: ScheduleLesson,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig
): SlotPosition[] {
  const validSlots: SlotPosition[] = [];
  const { daysOfWeek, numberOfPeriods, intervalAfterPeriod } = config;

  for (const day of daysOfWeek) {
    for (let period = 1; period <= numberOfPeriods; period++) {
      if (isDouble) {
        // Double period constraints
        // 1. Must have consecutive period available
        // 2. Cannot span across interval (e.g., period 3 and 4)
        if (period === intervalAfterPeriod || period === numberOfPeriods) {
          continue; // Can't start double at interval or last period
        }

        const nextPeriod = period + 1;
        
        // Check if both periods are free for all classes and teachers
        if (
          isSlotFree(lesson, day, period, grid, busyMap) &&
          isSlotFree(lesson, day, nextPeriod, grid, busyMap)
        ) {
          validSlots.push({ day, period });
        }
      } else {
        // Single period: just check if slot is free
        if (isSlotFree(lesson, day, period, grid, busyMap)) {
          validSlots.push({ day, period });
        }
      }
    }
  }

  return validSlots;
}

/**
 * Check if a slot is free for all classes and teachers in the lesson
 */
function isSlotFree(
  lesson: ScheduleLesson,
  day: string,
  period: number,
  grid: TimetableGrid,
  busyMap: BusyMap
): boolean {
  // Check if all classes are free
  for (const classId of lesson.classIds) {
    const key = `${classId}-${day}-${period}`;
    if (grid.has(key) || busyMap.has(key)) {
      return false;
    }
  }

  // Check if all teachers are free
  for (const teacherId of lesson.teacherIds) {
    const key = `${teacherId}-${day}-${period}`;
    if (busyMap.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Place a lesson in the grid and mark busy
 * Returns array of changes for backtracking
 */
interface Change {
  type: 'grid' | 'busy';
  key: string;
}

function placeLesson(
  lesson: ScheduleLesson,
  slot: SlotPosition,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap
): Change[] {
  const changes: Change[] = [];
  const { day, period } = slot;
  const periods = isDouble ? [period, period + 1] : [period];

  for (const p of periods) {
    // Mark grid slots for each class
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      grid.set(gridKey, lesson._id);
      changes.push({ type: 'grid', key: gridKey });
    }

    // Mark classes as busy
    for (const classId of lesson.classIds) {
      const busyKey = `${classId}-${day}-${p}`;
      busyMap.set(busyKey, true);
      changes.push({ type: 'busy', key: busyKey });
    }

    // Mark teachers as busy
    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${day}-${p}`;
      busyMap.set(busyKey, true);
      changes.push({ type: 'busy', key: busyKey });
    }
  }

  return changes;
}

/**
 * Undo changes for backtracking
 */
function undoChanges(changes: Change[], grid: TimetableGrid, busyMap: BusyMap): void {
  for (const change of changes) {
    if (change.type === 'grid') {
      grid.delete(change.key);
    } else {
      busyMap.delete(change.key);
    }
  }
}

/**
 * Convert grid map to array of timetable slots
 */
function gridToSlots(grid: TimetableGrid): TimetableSlot[] {
  const slots: TimetableSlot[] = [];
  const processed = new Set<string>();

  for (const [key, lessonId] of grid.entries()) {
    if (processed.has(key)) continue;

    const [classId, day, periodStr] = key.split('-');
    const period = parseInt(periodStr);

    // Check if this is part of a double period
    const nextKey = `${classId}-${day}-${period + 1}`;
    const isDoublePeriod = grid.get(nextKey) === lessonId;

    slots.push({
      classId,
      lessonId,
      day,
      periodNumber: period,
      isDoublePeriod,
    });

    processed.add(key);
    if (isDoublePeriod) {
      processed.add(nextKey); // Skip next period
    }
  }

  return slots;
}
