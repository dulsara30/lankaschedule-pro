/**
 * EduFlow AI - Advanced Min-Conflicts Scheduler with Swap Logic
 * 
 * Features:
 * 1. Min-Conflicts Algorithm: Swaps existing lessons to make room
 * 2. Forward Checking: Validates future lesson placement feasibility
 * 3. Priority-Based Ordering: Hardest lessons first
 * 4. Detailed Conflict Diagnostics: Per-lesson failure reasons
 * 5. Smart Swap Suggestions: Identifies viable swaps for failed lessons
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
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
}

export interface ScheduleConfig {
  numberOfPeriods: number;
  intervalSlots: number[];
  daysOfWeek: string[];
}

export interface ConflictDiagnostic {
  lessonId: string;
  lessonName: string;
  requiredPeriods: number;
  failureReason: string;
  detailedConflicts: {
    teacherBusyCount: number;
    classBusyCount: number;
    noDoubleSlotCount: number;
    dailyLimitCount: number;
  };
  suggestedSwaps?: SwapSuggestion[];
}

export interface SwapSuggestion {
  targetSlot: { day: string; period: number };
  conflictingLesson: {
    lessonId: string;
    lessonName: string;
  };
  alternativeSlots: { day: string; period: number }[];
  swapFeasibility: 'easy' | 'moderate' | 'hard';
}

export interface ScheduleResult {
  success: boolean;
  slots: TimetableSlot[];
  failedLessons: ConflictDiagnostic[];
  stats: {
    totalSlots: number;
    scheduledLessons: number;
    failedLessons: number;
    swapAttempts: number;
    successfulSwaps: number;
    iterations: number;
  };
}

// Internal grid representation
interface GridSlot {
  lessonId: string;
  slotType: 'single' | 'double-start' | 'double-end';
}
type TimetableGrid = Map<string, GridSlot>;
type BusyMap = Map<string, boolean>;
type DailyLessonMap = Map<string, boolean>;

// Tracking
let iterationCount = 0;
let swapAttempts = 0;
let successfulSwaps = 0;
const MAX_ITERATIONS = 150000;
const MAX_SWAP_ATTEMPTS_PER_LESSON = 100;

// Lesson metadata cache for swap suggestions
const lessonMetadataCache = new Map<string, ScheduleLesson>();

/**
 * Main scheduling function with min-conflicts approach
 */
export function generateTimetable(
  lessons: ScheduleLesson[],
  classes: ScheduleClass[],
  config: ScheduleConfig
): ScheduleResult {
  // Reset counters
  iterationCount = 0;
  swapAttempts = 0;
  successfulSwaps = 0;
  lessonMetadataCache.clear();

  // Cache lesson metadata for quick lookup
  for (const lesson of lessons) {
    lessonMetadataCache.set(lesson._id, lesson);
  }

  const grid: TimetableGrid = new Map();
  const busyMap: BusyMap = new Map();
  const dailyLessonMap: DailyLessonMap = new Map();
  const scheduledLessons = new Set<string>();
  const failedDiagnostics: ConflictDiagnostic[] = [];

  // PRIORITY 1: Sort lessons by difficulty (hardest first)
  const sortedLessons = prioritizeLessons(lessons);

  console.log(`🚀 Min-Conflicts Scheduler: ${lessons.length} lessons, ${sortedLessons.length} total`);
  console.log(`📊 Config: ${config.numberOfPeriods} periods/day, intervals after: ${config.intervalSlots.join(', ')}`);
  
  // Log top 5 hardest lessons
  console.log('🎯 Priority Order (Top 5 Hardest):');
  sortedLessons.slice(0, 5).forEach((lesson, i) => {
    const totalPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
    console.log(`   ${i + 1}. ${lesson.lessonName}: ${lesson.numberOfDoubles}D + ${lesson.numberOfSingles}S = ${totalPeriods} periods`);
  });

  // Expand lessons into tasks
  const tasks = expandLessonsToTasks(sortedLessons);
  
  console.log(`📋 Task Breakdown: ${tasks.filter(t => t.isDouble).length} double tasks, ${tasks.filter(t => !t.isDouble).length} single tasks`);

  // Run min-conflicts backtracking with swap capability
  const success = minConflictsBacktrack(
    tasks,
    0,
    grid,
    busyMap,
    dailyLessonMap,
    scheduledLessons,
    config
  );

  // Convert grid to slots
  const slots = gridToSlots(grid);

  // Generate diagnostics for failed lessons
  for (const lesson of lessons) {
    if (!scheduledLessons.has(lesson._id)) {
      const diagnostic = generateConflictDiagnostic(lesson, grid, busyMap, dailyLessonMap, config);
      failedDiagnostics.push(diagnostic);
    }
  }

  console.log(`✅ Scheduler Complete: ${slots.length} slots created`);
  console.log(`📊 Stats: ${scheduledLessons.size}/${lessons.length} lessons scheduled`);
  console.log(`🔄 Swaps: ${successfulSwaps}/${swapAttempts} successful`);
  console.log(`⚡ Iterations: ${iterationCount}/${MAX_ITERATIONS}`);

  return {
    success,
    slots,
    failedLessons: failedDiagnostics,
    stats: {
      totalSlots: slots.length,
      scheduledLessons: scheduledLessons.size,
      failedLessons: failedDiagnostics.length,
      swapAttempts,
      successfulSwaps,
      iterations: iterationCount,
    },
  };
}

/**
 * PRIORITY SCHEDULING: Hardest lessons first
 * Criteria:
 * 1. Most double periods (hardest to place)
 * 2. Teachers near 35-period limit
 * 3. Total periods required
 * 4. Number of classes
 */
function prioritizeLessons(lessons: ScheduleLesson[]): ScheduleLesson[] {
  return [...lessons].sort((a, b) => {
    // Primary: Number of doubles (harder to fit)
    if (b.numberOfDoubles !== a.numberOfDoubles) {
      return b.numberOfDoubles - a.numberOfDoubles;
    }

    // Secondary: Total periods (more demanding)
    const totalA = a.numberOfSingles + (a.numberOfDoubles * 2);
    const totalB = b.numberOfSingles + (b.numberOfDoubles * 2);
    if (totalB !== totalA) {
      return totalB - totalA;
    }

    // Tertiary: Number of classes (more constrained)
    if (b.classIds.length !== a.classIds.length) {
      return b.classIds.length - a.classIds.length;
    }

    // Quaternary: Number of teachers (more conflicts)
    return b.teacherIds.length - a.teacherIds.length;
  });
}

/**
 * Expand lessons into individual scheduling tasks
 */
interface ScheduleTask {
  lesson: ScheduleLesson;
  isDouble: boolean;
  taskId: string;
}

function expandLessonsToTasks(lessons: ScheduleLesson[]): ScheduleTask[] {
  const tasks: ScheduleTask[] = [];

  for (const lesson of lessons) {
    // Add all double period tasks first (harder to place)
    for (let i = 0; i < lesson.numberOfDoubles; i++) {
      tasks.push({
        lesson,
        isDouble: true,
        taskId: `${lesson._id}-double-${i}`,
      });
    }

    // Then add single period tasks
    for (let i = 0; i < lesson.numberOfSingles; i++) {
      tasks.push({
        lesson,
        isDouble: false,
        taskId: `${lesson._id}-single-${i}`,
      });
    }
  }

  return tasks;
}

/**
 * MIN-CONFLICTS BACKTRACKING with Swap Logic
 */
interface SlotPosition {
  day: string;
  period: number;
}

function minConflictsBacktrack(
  tasks: ScheduleTask[],
  taskIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  scheduledLessons: Set<string>,
  config: ScheduleConfig
): boolean {
  iterationCount++;

  if (iterationCount >= MAX_ITERATIONS) {
    console.warn(`⚠️ Iteration limit reached (${MAX_ITERATIONS})`);
    return false;
  }

  // Base case: all tasks scheduled
  if (taskIndex >= tasks.length) {
    return true;
  }

  const task = tasks[taskIndex];
  const { lesson, isDouble } = task;

  // FORWARD CHECKING: Verify remaining tasks are still feasible
  if (taskIndex % 50 === 0) { // Check every 50 tasks
    if (!forwardCheck(tasks, taskIndex, grid, busyMap, dailyLessonMap, config)) {
      return false; // Dead end detected
    }
  }

  // Find valid slots with LCV heuristic
  const validSlots = findValidSlotsWithLCV(lesson, isDouble, grid, busyMap, dailyLessonMap, config);

  // Try each valid slot
  for (const slot of validSlots) {
    // Check daily limit
    if (!canScheduleOnDay(lesson, slot.day, dailyLessonMap)) {
      continue;
    }

    // Check conflicts
    const conflicts = checkSlotConflicts(lesson, slot, isDouble, grid, busyMap);
    
    if (!conflicts.hasConflict) {
      // No conflict: place normally
      const changes = placeLesson(lesson, slot, isDouble, grid, busyMap, dailyLessonMap);

      if (minConflictsBacktrack(tasks, taskIndex + 1, grid, busyMap, dailyLessonMap, scheduledLessons, config)) {
        scheduledLessons.add(lesson._id);
        return true;
      }

      undoChanges(changes, grid, busyMap, dailyLessonMap);
    } else {
      // CONFLICT: Try swapping existing lesson
      if (swapAttempts < MAX_SWAP_ATTEMPTS_PER_LESSON) {
        const swapSucceeded = attemptSwap(
          lesson,
          slot,
          isDouble,
          tasks,
          taskIndex,
          grid,
          busyMap,
          dailyLessonMap,
          scheduledLessons,
          config
        );

        if (swapSucceeded) {
          return true;
        }
      }
    }
  }

  // No valid placement found
  return false;
}

/**
 * FORWARD CHECKING: Ensure remaining tasks can still be placed
 */
function forwardCheck(
  tasks: ScheduleTask[],
  currentIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): boolean {
  // Check next 10 unscheduled tasks
  for (let i = currentIndex + 1; i < Math.min(currentIndex + 11, tasks.length); i++) {
    const task = tasks[i];
    const validSlots = findValidSlotsWithLCV(
      task.lesson,
      task.isDouble,
      grid,
      busyMap,
      dailyLessonMap,
      config
    );

    if (validSlots.length === 0) {
      console.warn(`⚠️ Forward check failed: Task ${task.taskId} has no valid slots`);
      return false;
    }
  }

  return true;
}

/**
 * SWAP LOGIC: Try moving an existing lesson to make room
 */
function attemptSwap(
  newLesson: ScheduleLesson,
  targetSlot: SlotPosition,
  isDouble: boolean,
  tasks: ScheduleTask[],
  taskIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  scheduledLessons: Set<string>,
  config: ScheduleConfig
): boolean {
  swapAttempts++;

  // Find conflicting lesson at target slot
  const periods = isDouble ? [targetSlot.period, targetSlot.period + 1] : [targetSlot.period];
  
  for (const period of periods) {
    for (const classId of newLesson.classIds) {
      const gridKey = `${classId}-${targetSlot.day}-${period}`;
      const existingSlot = grid.get(gridKey);

      if (existingSlot) {
        const conflictingLessonId = existingSlot.lessonId;
        const conflictingLesson = lessonMetadataCache.get(conflictingLessonId);

        if (!conflictingLesson) continue;

        // Check if conflicting lesson is same as new lesson (ET/Bst vs ET / BST fix)
        // Normalize lesson names for comparison
        const normalizedNew = normalizeLessonName(newLesson.lessonName);
        const normalizedConflict = normalizeLessonName(conflictingLesson.lessonName);
        
        if (normalizedNew === normalizedConflict) {
          // Same subject - don't swap with itself
          continue;
        }

        // Find alternative slots for conflicting lesson
        const isConflictDouble = existingSlot.slotType !== 'single';
        const alternativeSlots = findValidSlotsWithLCV(
          conflictingLesson,
          isConflictDouble,
          grid,
          busyMap,
          dailyLessonMap,
          config
        );

        for (const altSlot of alternativeSlots) {
          // Don't swap to same slot
          if (altSlot.day === targetSlot.day && altSlot.period === targetSlot.period) {
            continue;
          }

          // Try removing conflicting lesson and placing in alternative slot
          const removalChanges = removeLesson(
            conflictingLessonId,
            targetSlot.day,
            period,
            grid,
            busyMap,
            dailyLessonMap
          );

          // Try placing conflicting lesson in alternative slot
          const conflicts = checkSlotConflicts(conflictingLesson, altSlot, isConflictDouble, grid, busyMap);
          
          if (!conflicts.hasConflict && canScheduleOnDay(conflictingLesson, altSlot.day, dailyLessonMap)) {
            const altPlacementChanges = placeLesson(
              conflictingLesson,
              altSlot,
              isConflictDouble,
              grid,
              busyMap,
              dailyLessonMap
            );

            // Now try placing new lesson in target slot
            const newPlacementChanges = placeLesson(newLesson, targetSlot, isDouble, grid, busyMap, dailyLessonMap);

            // Continue with backtracking
            if (minConflictsBacktrack(tasks, taskIndex + 1, grid, busyMap, dailyLessonMap, scheduledLessons, config)) {
              scheduledLessons.add(newLesson._id);
              successfulSwaps++;
              console.log(`🔄 Successful swap: Moved ${conflictingLesson.lessonName} from ${targetSlot.day}P${targetSlot.period} to ${altSlot.day}P${altSlot.period}`);
              return true;
            }

            // Swap failed - undo everything
            undoChanges(newPlacementChanges, grid, busyMap, dailyLessonMap);
            undoChanges(altPlacementChanges, grid, busyMap, dailyLessonMap);
            reapplyChanges(removalChanges, grid, busyMap, dailyLessonMap);
          } else {
            // Alternative slot not valid - restore original
            reapplyChanges(removalChanges, grid, busyMap, dailyLessonMap);
          }
        }
      }
    }
  }

  return false;
}

/**
 * Normalize lesson names to handle "ET/Bst" vs "ET / BST" distinctions
 */
function normalizeLessonName(name: string): string {
  // Remove spaces around slashes and convert to uppercase
  return name.replace(/\s*\/\s*/g, '/').toUpperCase().trim();
}

/**
 * Remove lesson from grid (for swapping)
 */
interface Change {
  type: 'grid' | 'busy' | 'daily';
  key: string;
  value?: GridSlot;
}

function removeLesson(
  lessonId: string,
  day: string,
  period: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap
): Change[] {
  const changes: Change[] = [];

  // Find all slots for this lesson on this day
  const keysToRemove: string[] = [];
  for (const [key, slot] of grid.entries()) {
    if (slot.lessonId === lessonId && key.includes(`-${day}-`)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    const slot = grid.get(key);
    if (slot) {
      changes.push({ type: 'grid', key, value: slot });
      grid.delete(key);
    }
  }

  // Remove busy markers
  const busyKeysToRemove: string[] = [];
  for (const [key] of busyMap.entries()) {
    if (key.includes(`-${day}-${period}`)) {
      busyKeysToRemove.push(key);
    }
  }

  for (const key of busyKeysToRemove) {
    changes.push({ type: 'busy', key });
    busyMap.delete(key);
  }

  // Remove daily markers
  const dailyKeysToRemove: string[] = [];
  for (const [key] of dailyLessonMap.entries()) {
    if (key.includes(`-${day}-${lessonId}`)) {
      dailyKeysToRemove.push(key);
    }
  }

  for (const key of dailyKeysToRemove) {
    changes.push({ type: 'daily', key });
    dailyLessonMap.delete(key);
  }

  return changes;
}

/**
 * Reapply changes (for undoing swap attempts)
 */
function reapplyChanges(
  changes: Change[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap
): void {
  for (const change of changes) {
    if (change.type === 'grid' && change.value) {
      grid.set(change.key, change.value);
    } else if (change.type === 'busy') {
      busyMap.set(change.key, true);
    } else if (change.type === 'daily') {
      dailyLessonMap.set(change.key, true);
    }
  }
}

/**
 * Find valid slots with LCV heuristic
 */
interface LCVSlot extends SlotPosition {
  lcvScore: number;
}

function findValidSlotsWithLCV(
  lesson: ScheduleLesson,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): LCVSlot[] {
  const validSlots: LCVSlot[] = [];
  const { daysOfWeek, numberOfPeriods, intervalSlots } = config;

  for (const day of daysOfWeek) {
    for (let period = 1; period <= numberOfPeriods; period++) {
      if (isDouble) {
        // Double period constraints
        if (period === numberOfPeriods) continue; // Can't start at last period
        if (intervalSlots.includes(period)) continue; // Can't span interval

        const nextPeriod = period + 1;
        if (
          isSlotFree(lesson, day, period, grid, busyMap) &&
          isSlotFree(lesson, day, nextPeriod, grid, busyMap)
        ) {
          const lcvScore = calculateLCVScore(lesson, day, period, isDouble, grid, busyMap, config);
          validSlots.push({ day, period, lcvScore });
        }
      } else {
        // Single period
        if (isSlotFree(lesson, day, period, grid, busyMap)) {
          const lcvScore = calculateLCVScore(lesson, day, period, isDouble, grid, busyMap, config);
          validSlots.push({ day, period, lcvScore });
        }
      }
    }
  }

  // Sort by LCV score (higher = better)
  validSlots.sort((a, b) => b.lcvScore - a.lcvScore);

  return validSlots;
}

/**
 * Calculate LCV score
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

  for (const otherDay of daysOfWeek) {
    if (otherDay === day) continue;
    
    for (let p = 1; p <= numberOfPeriods; p++) {
      if (isSlotFree(lesson, otherDay, p, grid, busyMap)) {
        score++;
      }
    }
  }

  return score;
}

/**
 * Check if slot is free
 */
function isSlotFree(
  lesson: ScheduleLesson,
  day: string,
  period: number,
  grid: TimetableGrid,
  busyMap: BusyMap
): boolean {
  for (const classId of lesson.classIds) {
    const key = `${classId}-${day}-${period}`;
    if (grid.has(key) || busyMap.has(key)) {
      return false;
    }
  }

  for (const teacherId of lesson.teacherIds) {
    const key = `${teacherId}-${day}-${period}`;
    if (busyMap.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Check slot conflicts
 */
interface SlotConflictResult {
  hasConflict: boolean;
  busyTeachers: string[];
  busyClasses: string[];
}

function checkSlotConflicts(
  lesson: ScheduleLesson,
  slot: SlotPosition,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap
): SlotConflictResult {
  const busyTeachers: string[] = [];
  const busyClasses: string[] = [];
  const periods = isDouble ? [slot.period, slot.period + 1] : [slot.period];

  for (const period of periods) {
    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${slot.day}-${period}`;
      if (busyMap.has(busyKey) && !busyTeachers.includes(teacherId)) {
        busyTeachers.push(teacherId);
      }
    }

    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${slot.day}-${period}`;
      if ((grid.has(gridKey) || busyMap.has(gridKey)) && !busyClasses.includes(classId)) {
        busyClasses.push(classId);
      }
    }
  }

  return {
    hasConflict: busyTeachers.length > 0 || busyClasses.length > 0,
    busyTeachers,
    busyClasses,
  };
}

/**
 * Check if lesson can be scheduled on day
 */
function canScheduleOnDay(
  lesson: ScheduleLesson,
  day: string,
  dailyLessonMap: DailyLessonMap
): boolean {
  for (const classId of lesson.classIds) {
    const key = `${classId}-${day}-${lesson._id}`;
    if (dailyLessonMap.has(key)) {
      return false;
    }
  }
  return true;
}

/**
 * Place lesson in grid
 */
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
    
    let slotType: 'single' | 'double-start' | 'double-end';
    if (!isDouble) {
      slotType = 'single';
    } else if (i === 0) {
      slotType = 'double-start';
    } else {
      slotType = 'double-end';
    }
    
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      grid.set(gridKey, { lessonId: lesson._id, slotType });
      changes.push({ type: 'grid', key: gridKey });
    }

    for (const classId of lesson.classIds) {
      const busyKey = `${classId}-${day}-${p}`;
      busyMap.set(busyKey, true);
      changes.push({ type: 'busy', key: busyKey });
    }

    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${day}-${p}`;
      busyMap.set(busyKey, true);
      changes.push({ type: 'busy', key: busyKey });
    }
  }

  for (const classId of lesson.classIds) {
    const dailyKey = `${classId}-${day}-${lesson._id}`;
    dailyLessonMap.set(dailyKey, true);
    changes.push({ type: 'daily', key: dailyKey });
  }

  return changes;
}

/**
 * Undo changes for backtracking
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
 * Convert grid to slots array
 */
function gridToSlots(grid: TimetableGrid): TimetableSlot[] {
  const slots: TimetableSlot[] = [];

  for (const [key, gridSlot] of grid.entries()) {
    const [classId, day, periodStr] = key.split('-');
    const period = parseInt(periodStr);

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
  }

  return slots;
}

/**
 * Generate detailed conflict diagnostic for failed lesson
 */
function generateConflictDiagnostic(
  lesson: ScheduleLesson,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): ConflictDiagnostic {
  const requiredPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
  
  let teacherBusyCount = 0;
  let classBusyCount = 0;
  let noDoubleSlotCount = 0;
  let dailyLimitCount = 0;

  const { daysOfWeek, numberOfPeriods, intervalSlots } = config;

  // Analyze why lesson failed
  for (const day of daysOfWeek) {
    // Check daily limit
    let dayBlocked = false;
    for (const classId of lesson.classIds) {
      const key = `${classId}-${day}-${lesson._id}`;
      if (dailyLessonMap.has(key)) {
        dailyLimitCount++;
        dayBlocked = true;
        break;
      }
    }

    if (dayBlocked) continue;

    for (let period = 1; period <= numberOfPeriods; period++) {
      // Check for teacher conflicts
      for (const teacherId of lesson.teacherIds) {
        const busyKey = `${teacherId}-${day}-${period}`;
        if (busyMap.has(busyKey)) {
          teacherBusyCount++;
        }
      }

      // Check for class conflicts
      for (const classId of lesson.classIds) {
        const gridKey = `${classId}-${day}-${period}`;
        if (grid.has(gridKey)) {
          classBusyCount++;
        }
      }

      // Check for double slot availability
      if (lesson.numberOfDoubles > 0) {
        if (period === numberOfPeriods || intervalSlots.includes(period)) {
          noDoubleSlotCount++;
        } else {
          const nextPeriod = period + 1;
          let doubleBlocked = false;
          
          for (const classId of lesson.classIds) {
            if (
              grid.has(`${classId}-${day}-${period}`) ||
              grid.has(`${classId}-${day}-${nextPeriod}`)
            ) {
              noDoubleSlotCount++;
              doubleBlocked = true;
              break;
            }
          }
        }
      }
    }
  }

  // Generate failure reason
  let failureReason = '';
  
  if (teacherBusyCount > classBusyCount && teacherBusyCount > noDoubleSlotCount) {
    // Find busiest teacher
    const teacherConflicts = new Map<string, number>();
    for (const day of daysOfWeek) {
      for (let period = 1; period <= numberOfPeriods; period++) {
        for (const teacherId of lesson.teacherIds) {
          const busyKey = `${teacherId}-${day}-${period}`;
          if (busyMap.has(busyKey)) {
            teacherConflicts.set(teacherId, (teacherConflicts.get(teacherId) || 0) + 1);
          }
        }
      }
    }
    const busiestTeacher = Array.from(teacherConflicts.entries()).sort((a, b) => b[1] - a[1])[0];
    failureReason = busiestTeacher 
      ? `Teacher ${busiestTeacher[0]} is already busy in most available time slots (${busiestTeacher[1]} conflicts).`
      : 'Teachers are over-allocated across the timetable.';
  } else if (noDoubleSlotCount > 0 && lesson.numberOfDoubles > 0) {
    failureReason = `No available consecutive period slots for ${lesson.numberOfDoubles} double period(s). Intervals after periods ${intervalSlots.join(', ')} prevent double period placement.`;
  } else if (dailyLimitCount > 0) {
    failureReason = `Daily subject limit reached. Lesson already scheduled for some classes on multiple days.`;
  } else if (classBusyCount > 0) {
    failureReason = `Classes are over-allocated. Not enough free periods across the week for ${requiredPeriods} total periods.`;
  } else {
    failureReason = `Unable to find valid time slots for ${requiredPeriods} periods (${lesson.numberOfDoubles} doubles + ${lesson.numberOfSingles} singles).`;
  }

  // Generate swap suggestions
  const suggestedSwaps = generateSwapSuggestions(lesson, grid, busyMap, dailyLessonMap, config);

  return {
    lessonId: lesson._id,
    lessonName: lesson.lessonName,
    requiredPeriods,
    failureReason,
    detailedConflicts: {
      teacherBusyCount,
      classBusyCount,
      noDoubleSlotCount,
      dailyLimitCount,
    },
    suggestedSwaps,
  };
}

/**
 * Generate smart swap suggestions for failed lesson
 */
function generateSwapSuggestions(
  lesson: ScheduleLesson,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];
  const { daysOfWeek, numberOfPeriods, intervalSlots } = config;
  const isDouble = lesson.numberOfDoubles > 0;

  for (const day of daysOfWeek) {
    for (let period = 1; period <= numberOfPeriods; period++) {
      // Skip if can't place double here
      if (isDouble) {
        if (period === numberOfPeriods || intervalSlots.includes(period)) continue;
      }

      // Find if there's exactly ONE conflict
      const conflicts = checkSlotConflicts(lesson, { day, period }, isDouble, grid, busyMap);
      
      if (conflicts.busyClasses.length === 1 && conflicts.busyTeachers.length === 0) {
        // Single class conflict - find what lesson is blocking
        const classId = conflicts.busyClasses[0];
        const gridKey = `${classId}-${day}-${period}`;
        const blockingSlot = grid.get(gridKey);

        if (blockingSlot) {
          const blockingLesson = lessonMetadataCache.get(blockingSlot.lessonId);
          if (blockingLesson) {
            // Find alternative slots for blocking lesson
            const isBlockingDouble = blockingSlot.slotType !== 'single';
            const alternatives = findValidSlotsWithLCV(
              blockingLesson,
              isBlockingDouble,
              grid,
              busyMap,
              dailyLessonMap,
              config
            ).slice(0, 3); // Top 3 alternatives

            if (alternatives.length > 0) {
              suggestions.push({
                targetSlot: { day, period },
                conflictingLesson: {
                  lessonId: blockingLesson._id,
                  lessonName: blockingLesson.lessonName,
                },
                alternativeSlots: alternatives.map(a => ({ day: a.day, period: a.period })),
                swapFeasibility: alternatives.length >= 3 ? 'easy' : alternatives.length >= 2 ? 'moderate' : 'hard',
              });
            }
          }
        }
      } else if (conflicts.busyTeachers.length === 1 && conflicts.busyClasses.length === 0) {
        // Single teacher conflict
        const teacherId = conflicts.busyTeachers[0];
        
        // Find teacher's lesson at this time
        let blockingLessonId: string | null = null;
        for (const [key, slot] of grid.entries()) {
          if (key.includes(`-${day}-${period}`)) {
            const blockingLesson = lessonMetadataCache.get(slot.lessonId);
            if (blockingLesson && blockingLesson.teacherIds.includes(teacherId)) {
              blockingLessonId = slot.lessonId;
              break;
            }
          }
        }

        if (blockingLessonId) {
          const blockingLesson = lessonMetadataCache.get(blockingLessonId);
          if (blockingLesson) {
            const isBlockingDouble = grid.get(`${blockingLesson.classIds[0]}-${day}-${period}`)?.slotType !== 'single';
            const alternatives = findValidSlotsWithLCV(
              blockingLesson,
              isBlockingDouble,
              grid,
              busyMap,
              dailyLessonMap,
              config
            ).slice(0, 3);

            if (alternatives.length > 0) {
              suggestions.push({
                targetSlot: { day, period },
                conflictingLesson: {
                  lessonId: blockingLesson._id,
                  lessonName: blockingLesson.lessonName,
                },
                alternativeSlots: alternatives.map(a => ({ day: a.day, period: a.period })),
                swapFeasibility: alternatives.length >= 3 ? 'easy' : alternatives.length >= 2 ? 'moderate' : 'hard',
              });
            }
          }
        }
      }

      if (suggestions.length >= 5) break; // Limit to 5 suggestions
    }
    if (suggestions.length >= 5) break;
  }

  return suggestions;
}
