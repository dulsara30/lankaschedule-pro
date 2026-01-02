/**
 * LankaSchedule Pro AI Engine - Ultimate Clash-Free Scheduling
 * 
 * Implements strict constraint satisfaction with:
 * 1. Dynamic grid configuration from school config
 * 2. Double period integrity (no splitting across intervals)
 * 3. Daily subject limit (one appearance per day per class)
 * 4. Weekly quota enforcement (exact singles/doubles)
 * 5. LCV heuristic for optimal slot selection
 */

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
  isDoubleStart?: boolean;  // First period of a double block
  isDoubleEnd?: boolean;    // Second period of a double block
}

export interface ScheduleConfig {
  numberOfPeriods: number; // STRICT: Must match school config
  intervalSlots: number[]; // Array of period numbers after which intervals occur
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

// Grid representation with UNIFIED double period metadata
// Map<"classId-day-period", { lessonId: string, slotType: 'single' | 'double-start' | 'double-end' }>
interface GridSlot {
  lessonId: string;
  slotType: 'single' | 'double-start' | 'double-end';
}
type TimetableGrid = Map<string, GridSlot>;

// Busy tracking: Map<"teacherId-day-period" | "classId-day-period", boolean>
type BusyMap = Map<string, boolean>;

// Daily lesson tracking: Map<"classId-day-lessonId", boolean>
// Ensures a lesson only appears once per day for a class
type DailyLessonMap = Map<string, boolean>;

const MAX_RECURSIONS = 100000; // Increased for complex schedules
let recursionCount = 0;

/**
 * Main scheduling function with strict constraint enforcement
 */
export function generateTimetable(
  lessons: ScheduleLesson[],
  classes: ScheduleClass[],
  config: ScheduleConfig
): ScheduleResult {
  recursionCount = 0;
  const grid: TimetableGrid = new Map();
  const busyMap: BusyMap = new Map();
  const dailyLessonMap: DailyLessonMap = new Map();
  const scheduledLessons = new Set<string>();
  const failedLessons: { lesson: ScheduleLesson; reason: string }[] = [];

  // Sort lessons by constraint difficulty (most constrained first)
  const sortedLessons = sortByConstraints(lessons);

  // Expand lessons into individual scheduling tasks with weekly quota tracking
  const tasks = expandLessonsToTasks(sortedLessons);

  console.log(`🚀 Scheduler: Starting with ${tasks.length} tasks for ${lessons.length} lessons`);
  console.log(`📊 Config: ${config.numberOfPeriods} periods, intervals after: ${config.intervalSlots.join(', ')}`);

  // Run backtracking algorithm
  const success = backtrack(tasks, 0, grid, busyMap, dailyLessonMap, scheduledLessons, config);

  // Convert grid to slots array
  const slots = gridToSlots(grid);

  // Identify failed lessons with detailed reasons
  for (const lesson of lessons) {
    if (!scheduledLessons.has(lesson._id)) {
      const requiredPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
      failedLessons.push({
        lesson,
        reason: `Could not schedule ${requiredPeriods} periods without conflicts`,
      });
    }
  }

  console.log(`✅ Scheduler: ${success ? 'Success' : 'Partial'} - ${slots.length} slots, ${recursionCount} recursions`);

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
 * PRIORITY: Lessons with more double periods are scheduled first
 * Secondary: More classes/teachers = more constrained
 */
function sortByConstraints(lessons: ScheduleLesson[]): ScheduleLesson[] {
  return [...lessons].sort((a, b) => {
    // Primary: Number of doubles (harder to schedule)
    const doublesA = a.numberOfDoubles;
    const doublesB = b.numberOfDoubles;
    if (doublesB !== doublesA) {
      return doublesB - doublesA; // More doubles = higher priority
    }
    
    // Secondary: Total periods required
    const totalA = a.numberOfSingles + (a.numberOfDoubles * 2);
    const totalB = b.numberOfSingles + (b.numberOfDoubles * 2);
    if (totalB !== totalA) {
      return totalB - totalA;
    }
    
    // Tertiary: Number of classes and teachers
    const scoreA = (a.classIds.length * 2) + a.teacherIds.length;
    const scoreB = (b.classIds.length * 2) + b.teacherIds.length;
    return scoreB - scoreA;
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
  const doubleTasks: ScheduleTask[] = [];
  const singleTasks: ScheduleTask[] = [];
  
  // CRITICAL: Separate doubles and singles
  for (const lesson of lessons) {
    // Collect all double period tasks
    for (let i = 0; i < lesson.numberOfDoubles; i++) {
      doubleTasks.push({
        lesson,
        isDouble: true,
        taskId: `${lesson._id}-double-${i}`,
      });
    }
    
    // Collect all single period tasks
    for (let i = 0; i < lesson.numberOfSingles; i++) {
      singleTasks.push({
        lesson,
        isDouble: false,
        taskId: `${lesson._id}-single-${i}`,
      });
    }
  }
  
  // PRIORITY ORDERING: ALL doubles FIRST, then ALL singles
  // This ensures consecutive slots are claimed before grid fills up
  const tasks = [...doubleTasks, ...singleTasks];
  
  console.log(`📋 Task Expansion: ${doubleTasks.length} doubles FIRST, then ${singleTasks.length} singles`);
  console.log(`   Example: ITT (1S + 4D) = 4 double tasks + 1 single task`);
  
  return tasks;
}

/**
 * Backtracking algorithm with strict daily subject limit and LCV heuristic
 */
function backtrack(
  tasks: ScheduleTask[],
  taskIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  scheduledLessons: Set<string>,
  config: ScheduleConfig
): boolean {
  // Check recursion limit
  recursionCount++;
  if (recursionCount >= MAX_RECURSIONS) {
    console.warn('⚠️ Recursion limit reached - returning partial solution');
    return false;
  }

  // Base case: all tasks scheduled
  if (taskIndex >= tasks.length) {
    return true;
  }

  const task = tasks[taskIndex];
  const { lesson, isDouble } = task;

  // Get all valid slots for this task with LCV heuristic
  const validSlots = findValidSlotsWithLCV(lesson, isDouble, grid, busyMap, dailyLessonMap, config);

  // Try each valid slot (already sorted by LCV)
  for (const slot of validSlots) {
    // HARD CONSTRAINT CHECK: Daily subject limit
    if (!canScheduleOnDay(lesson, slot.day, dailyLessonMap)) {
      continue; // Skip this day - lesson already scheduled
    }

    // Place lesson in slot(s)
    const changes = placeLesson(lesson, slot, isDouble, grid, busyMap, dailyLessonMap);

    // Recurse to next task
    if (backtrack(tasks, taskIndex + 1, grid, busyMap, dailyLessonMap, scheduledLessons, config)) {
      scheduledLessons.add(lesson._id);
      return true;
    }

    // Backtrack: undo changes
    undoChanges(changes, grid, busyMap, dailyLessonMap);
  }

  // No valid slot found for this task
  return false;
}

/**
 * Check if a lesson can be scheduled on a specific day for all its classes
 * STRICT RULE: One lesson block per day per class
 * - A single period counts as one block
 * - A double period counts as ONE block (not two)
 * - If Math was placed on Monday (single OR double), NO more Math on Monday
 */
function canScheduleOnDay(
  lesson: ScheduleLesson,
  day: string,
  dailyLessonMap: DailyLessonMap
): boolean {
  for (const classId of lesson.classIds) {
    const key = `${classId}-${day}-${lesson._id}`;
    if (dailyLessonMap.has(key)) {
      return false; // Lesson already scheduled for this class on this day
    }
  }
  return true;
}

/**
 * Find valid slots with Least Constraining Value (LCV) heuristic
 * Returns slots sorted by how much flexibility they leave for remaining tasks
 */
interface SlotPosition {
  day: string;
  period: number;
  lcvScore?: number; // Higher score = more flexibility for future tasks
}

function findValidSlotsWithLCV(
  lesson: ScheduleLesson,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): SlotPosition[] {
  const validSlots: SlotPosition[] = [];
  const { daysOfWeek, numberOfPeriods, intervalSlots } = config;

  for (const day of daysOfWeek) {
    // Check daily subject limit first
    if (!canScheduleOnDay(lesson, day, dailyLessonMap)) {
      continue; // Skip entire day if lesson already scheduled
    }

    for (let period = 1; period <= numberOfPeriods; period++) {
      if (isDouble) {
        // HARD CONSTRAINT: Double period integrity
        // 1. Must have consecutive period available
        // 2. CANNOT span across an interval slot
        // 3. Cannot start at the last period
        
        if (period === numberOfPeriods) {
          continue; // Can't start double at last period
        }

        // CRITICAL SAFEGUARD: Check if there's an interval AFTER this period
        // Example: If intervalSlots = [3] (interval after period 3)
        //   - Period 1-2: ✅ Valid double
        //   - Period 2-3: ✅ Valid double  
        //   - Period 3-4: ❌ INVALID - spans the interval
        //   - Period 4-5: ✅ Valid double (after interval)
        if (intervalSlots.includes(period)) {
          continue; // Cannot start double right before an interval
        }

        const nextPeriod = period + 1;
        
        // Check if both periods are free for all classes and teachers
        if (
          isSlotFree(lesson, day, period, grid, busyMap) &&
          isSlotFree(lesson, day, nextPeriod, grid, busyMap)
        ) {
          // Calculate LCV score (how many slots remain free)
          const lcvScore = calculateLCVScore(lesson, day, period, isDouble, grid, busyMap, config);
          validSlots.push({ day, period, lcvScore });
        }
      } else {
        // Single period: just check if slot is free
        if (isSlotFree(lesson, day, period, grid, busyMap)) {
          const lcvScore = calculateLCVScore(lesson, day, period, isDouble, grid, busyMap, config);
          validSlots.push({ day, period, lcvScore });
        }
      }
    }
  }

  // Sort by LCV score descending (pick slots that constrain future choices least)
  validSlots.sort((a, b) => (b.lcvScore || 0) - (a.lcvScore || 0));

  return validSlots;
}

/**
 * Calculate LCV score: count how many future slots would remain available
 * Higher score = more flexibility
 */
function calculateLCVScore(
  lesson: ScheduleLesson,
  day: string,
  period: number,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig
): number {
  let score = 0;
  const { daysOfWeek, numberOfPeriods } = config;

  // Count free slots in other days for this lesson's classes and teachers
  for (const otherDay of daysOfWeek) {
    if (otherDay === day) continue; // Skip current day
    
    for (let p = 1; p <= numberOfPeriods; p++) {
      if (isSlotFree(lesson, otherDay, p, grid, busyMap)) {
        score++;
      }
    }
  }

  return score;
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
 * Place a lesson in the grid and mark busy + daily lesson tracking
 * Returns array of changes for backtracking
 */
interface Change {
  type: 'grid' | 'busy' | 'daily';
  key: string;
}

function placeLesson(
  lesson: ScheduleLesson,
  slot: SlotPosition,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap
): Change[] {
  const changes: Change[] = [];
  const { day, period } = slot;
  const periods = isDouble ? [period, period + 1] : [period];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    
    // Determine slot type based on position in double period
    let slotType: 'single' | 'double-start' | 'double-end';
    if (!isDouble) {
      slotType = 'single';
    } else if (i === 0) {
      slotType = 'double-start'; // First period of double
    } else {
      slotType = 'double-end'; // Second period of double
    }
    
    // Mark grid slots for each class with UNIFIED double period metadata
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      grid.set(gridKey, {
        lessonId: lesson._id,
        slotType: slotType, // 'single' | 'double-start' | 'double-end'
      });
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

  // Mark daily lesson tracking (once per day, not per period)
  // STRICT: One appearance per day (single OR double counts as one)
  for (const classId of lesson.classIds) {
    const dailyKey = `${classId}-${day}-${lesson._id}`;
    dailyLessonMap.set(dailyKey, true);
    changes.push({ type: 'daily', key: dailyKey });
  }

  return changes;
}

/**
 * Undo changes for backtracking (including daily lesson map)
 */
function undoChanges(
  changes: Change[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap
): void {
  for (const change of changes) {
    if (change.type === 'grid') {
      grid.delete(change.key);
    } else if (change.type === 'busy') {
      busyMap.delete(change.key);
    } else if (change.type === 'daily') {
      dailyLessonMap.delete(change.key);
    }
  }
}

/**
 * Convert grid map to array of timetable slots
 * Uses slotType metadata to set isDoubleStart and isDoubleEnd flags
 */
function gridToSlots(grid: TimetableGrid): TimetableSlot[] {
  const slots: TimetableSlot[] = [];
  const processed = new Set<string>();

  for (const [key, gridSlot] of grid.entries()) {
    if (processed.has(key)) continue;

    const [classId, day, periodStr] = key.split('-');
    const period = parseInt(periodStr);

    // Read slotType metadata to determine double period flags
    const isDoubleStart = gridSlot.slotType === 'double-start';
    const isDoubleEnd = gridSlot.slotType === 'double-end';

    slots.push({
      classId,
      lessonId: gridSlot.lessonId,
      day,
      periodNumber: period,
      isDoubleStart,
      isDoubleEnd,
    });

    processed.add(key);
    
    // If this is the start of a double block, skip the end period
    if (isDoubleStart) {
      const nextKey = `${classId}-${day}-${period + 1}`;
      processed.add(nextKey);
    }
  }

  return slots;
}
