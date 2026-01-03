/**
 * EduFlow AI - Strict Interval-Aware Deep Repair Scheduler
 * 
 * Features:
 * 1. STRICT INTERVAL ENFORCEMENT: Double periods cannot span interval breaks
 * 2. DEEP SWAP CHAINS: Up to 3-level iterative repair with 500K iterations
 * 3. BOTTLENECK-FIRST SCHEDULING: Resource-heavy lessons scheduled first
 * 4. LOAD NORMALIZATION: Max 35 periods per teacher/class
 * 5. GLOBAL PRESSURE HEURISTIC: Schedule into days with most teacher availability
 * 6. DETAILED DIAGNOSTICS: Explicit interval and teacher bottleneck reporting
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
    deepSwapChains: number;
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

// Load tracking
interface LoadTracker {
  teacherLoads: Map<string, number>; // teacherId -> period count
  classLoads: Map<string, number>;   // classId -> period count
}

// Tracking
let iterationCount = 0;
let swapAttempts = 0;
let successfulSwaps = 0;
let deepSwapChains = 0;
const MAX_ITERATIONS = 500000; // Increased for stochastic local search
const MAX_SWAP_DEPTH = 3; // Deep swap chain depth
const MAX_LOAD_PER_ENTITY = 35; // Max periods per teacher/class

// Lesson metadata cache
const lessonMetadataCache = new Map<string, ScheduleLesson>();

// Valid double period start positions (cached per config)
let validDoubleStarts: number[] = [];

/**
 * Main scheduling function with strict interval awareness
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
  deepSwapChains = 0;
  lessonMetadataCache.clear();

  // Cache lesson metadata
  for (const lesson of lessons) {
    lessonMetadataCache.set(lesson._id, lesson);
  }

  // CRITICAL: Calculate valid double period start positions
  validDoubleStarts = calculateValidDoubleStarts(config);
  console.log(`🔒 STRICT INTERVAL ENFORCEMENT:`);
  console.log(`   Intervals after periods: ${config.intervalSlots.join(', ')}`);
  console.log(`   Valid double-period start positions: ${validDoubleStarts.join(', ')}`);
  console.log(`   FORBIDDEN double starts: ${config.intervalSlots.join(', ')} (would span interval)`);

  const grid: TimetableGrid = new Map();
  const busyMap: BusyMap = new Map();
  const dailyLessonMap: DailyLessonMap = new Map();
  const scheduledLessons = new Set<string>();
  const failedDiagnostics: ConflictDiagnostic[] = [];

  // Initialize load tracker
  const loadTracker: LoadTracker = {
    teacherLoads: new Map(),
    classLoads: new Map(),
  };

  // BOTTLENECK-FIRST SCHEDULING: Sort by resource intensity
  const sortedLessons = bottleneckFirstSort(lessons);

  console.log(`🚀 Deep Repair Scheduler: ${lessons.length} lessons`);
  console.log(`📊 Config: ${config.numberOfPeriods} periods/day × ${config.daysOfWeek.length} days = ${config.numberOfPeriods * config.daysOfWeek.length} total slots`);
  
  // Log top 5 resource bottlenecks
  console.log('🎯 BOTTLENECK-FIRST PRIORITY (Top 5 Resource-Heavy):');
  sortedLessons.slice(0, 5).forEach((lesson, i) => {
    const totalPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
    const resourceScore = lesson.teacherIds.length + lesson.classIds.length;
    console.log(`   ${i + 1}. ${lesson.lessonName}: ${lesson.teacherIds.length}T × ${lesson.classIds.length}C = ${resourceScore} resource units, ${totalPeriods}P`);
  });

  // Expand lessons into tasks
  const tasks = expandLessonsToTasks(sortedLessons);
  
  const totalPeriods = tasks.reduce((sum, t) => sum + (t.isDouble ? 2 : 1), 0);
  console.log(`📋 Task Breakdown: ${tasks.filter(t => t.isDouble).length} double tasks + ${tasks.filter(t => !t.isDouble).length} single tasks = ${totalPeriods} total periods`);

  // Run deep repair backtracking
  const success = deepRepairBacktrack(
    tasks,
    0,
    grid,
    busyMap,
    dailyLessonMap,
    scheduledLessons,
    loadTracker,
    config
  );

  // Convert grid to slots
  const slots = gridToSlots(grid);

  // Generate diagnostics for failed lessons
  for (const lesson of lessons) {
    if (!scheduledLessons.has(lesson._id)) {
      const diagnostic = generateDetailedDiagnostic(lesson, grid, busyMap, dailyLessonMap, loadTracker, config);
      failedDiagnostics.push(diagnostic);
    }
  }

  console.log(`✅ Scheduler Complete: ${slots.length} slots created`);
  console.log(`📊 Stats: ${scheduledLessons.size}/${lessons.length} lessons scheduled`);
  console.log(`🔄 Swaps: ${successfulSwaps}/${swapAttempts} successful (${deepSwapChains} deep chains)`);
  console.log(`⚡ Iterations: ${iterationCount.toLocaleString()}/${MAX_ITERATIONS.toLocaleString()}`);

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
      deepSwapChains,
    },
  };
}

/**
 * STRICT INTERVAL ENFORCEMENT: Calculate valid double period start positions
 * A double period starting at position P spans P and P+1
 * If intervalSlots = [3], then P=3 is FORBIDDEN (would span 3-4, but interval is after 3)
 */
function calculateValidDoubleStarts(config: ScheduleConfig): number[] {
  const { numberOfPeriods, intervalSlots } = config;
  const validStarts: number[] = [];

  for (let period = 1; period < numberOfPeriods; period++) {
    // Can't start double at last period (no P+1)
    if (period === numberOfPeriods) continue;

    // CRITICAL: If this period is an interval boundary, FORBID double start
    if (intervalSlots.includes(period)) {
      continue; // Starting here would span the interval
    }

    // Valid double start position
    validStarts.push(period);
  }

  return validStarts;
}

/**
 * BOTTLENECK-FIRST SCHEDULING: Prioritize resource-intensive lessons
 * Lessons with many teachers AND many classes are hardest to schedule
 */
function bottleneckFirstSort(lessons: ScheduleLesson[]): ScheduleLesson[] {
  return [...lessons].sort((a, b) => {
    // Primary: Resource bottleneck score (teachers × classes)
    const bottleneckA = a.teacherIds.length * a.classIds.length;
    const bottleneckB = b.teacherIds.length * b.classIds.length;
    if (bottleneckB !== bottleneckA) {
      return bottleneckB - bottleneckA;
    }

    // Secondary: Total teachers + classes (more entities = more constraints)
    const entityCountA = a.teacherIds.length + a.classIds.length;
    const entityCountB = b.teacherIds.length + b.classIds.length;
    if (entityCountB !== entityCountA) {
      return entityCountB - entityCountA;
    }

    // Tertiary: Number of doubles (harder to fit)
    if (b.numberOfDoubles !== a.numberOfDoubles) {
      return b.numberOfDoubles - a.numberOfDoubles;
    }

    // Quaternary: Total periods required
    const totalA = a.numberOfSingles + (a.numberOfDoubles * 2);
    const totalB = b.numberOfSingles + (b.numberOfDoubles * 2);
    return totalB - totalA;
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
 * DEEP REPAIR BACKTRACKING with 3-level swap chains
 */
interface SlotPosition {
  day: string;
  period: number;
}

function deepRepairBacktrack(
  tasks: ScheduleTask[],
  taskIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  scheduledLessons: Set<string>,
  loadTracker: LoadTracker,
  config: ScheduleConfig
): boolean {
  iterationCount++;

  if (iterationCount >= MAX_ITERATIONS) {
    console.warn(`⚠️ Iteration limit reached (${MAX_ITERATIONS.toLocaleString()})`);
    return false;
  }

  // Progress logging every 50K iterations
  if (iterationCount % 50000 === 0) {
    console.log(`   ⚡ ${iterationCount.toLocaleString()} iterations, ${scheduledLessons.size} lessons placed, ${swapAttempts} swaps tried`);
  }

  // Base case: all tasks scheduled
  if (taskIndex >= tasks.length) {
    return true;
  }

  const task = tasks[taskIndex];
  const { lesson, isDouble } = task;

  // LOAD NORMALIZATION: Check if lesson would exceed load limits
  if (!canScheduleWithinLoadLimits(lesson, loadTracker)) {
    return false; // Exceeds load capacity
  }

  // Find valid slots with GLOBAL PRESSURE heuristic
  const validSlots = findValidSlotsWithPressure(lesson, isDouble, grid, busyMap, dailyLessonMap, loadTracker, config);

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
      const changes = placeLesson(lesson, slot, isDouble, grid, busyMap, dailyLessonMap, loadTracker);

      if (deepRepairBacktrack(tasks, taskIndex + 1, grid, busyMap, dailyLessonMap, scheduledLessons, loadTracker, config)) {
        scheduledLessons.add(lesson._id);
        return true;
      }

      undoChanges(changes, grid, busyMap, dailyLessonMap, loadTracker);
    } else {
      // CONFLICT: Try deep swap chain (up to 3 levels)
      const swapSucceeded = attemptDeepSwapChain(
        lesson,
        slot,
        isDouble,
        tasks,
        taskIndex,
        grid,
        busyMap,
        dailyLessonMap,
        scheduledLessons,
        loadTracker,
        config,
        0 // Start at depth 0
      );

      if (swapSucceeded) {
        return true;
      }
    }
  }

  // No valid placement found
  return false;
}

/**
 * LOAD NORMALIZATION: Check if scheduling lesson would exceed 35-period limit
 */
function canScheduleWithinLoadLimits(lesson: ScheduleLesson, loadTracker: LoadTracker): boolean {
  const periodsToAdd = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);

  // Check teachers
  for (const teacherId of lesson.teacherIds) {
    const currentLoad = loadTracker.teacherLoads.get(teacherId) || 0;
    if (currentLoad + periodsToAdd > MAX_LOAD_PER_ENTITY) {
      return false; // Would exceed teacher load
    }
  }

  // Check classes
  for (const classId of lesson.classIds) {
    const currentLoad = loadTracker.classLoads.get(classId) || 0;
    if (currentLoad + periodsToAdd > MAX_LOAD_PER_ENTITY) {
      return false; // Would exceed class load
    }
  }

  return true;
}

/**
 * GLOBAL PRESSURE HEURISTIC: Find valid slots prioritizing days with most teacher availability
 */
interface PressureSlot extends SlotPosition {
  pressureScore: number; // Higher = better (more free slots for this teacher on this day)
}

function findValidSlotsWithPressure(
  lesson: ScheduleLesson,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  loadTracker: LoadTracker,
  config: ScheduleConfig
): PressureSlot[] {
  const validSlots: PressureSlot[] = [];
  const { daysOfWeek, numberOfPeriods } = config;

  for (const day of daysOfWeek) {
    // Calculate pressure score for this day (teacher availability)
    const pressureScore = calculateDayPressure(lesson, day, grid, busyMap, config);

    if (isDouble) {
      // STRICT INTERVAL ENFORCEMENT: Use pre-calculated valid double starts
      for (const period of validDoubleStarts) {
        const nextPeriod = period + 1;

        // Check if both periods are free
        if (
          isSlotFree(lesson, day, period, grid, busyMap) &&
          isSlotFree(lesson, day, nextPeriod, grid, busyMap)
        ) {
          validSlots.push({ day, period, pressureScore });
        }
      }
    } else {
      // Single period: any period is fine
      for (let period = 1; period <= numberOfPeriods; period++) {
        if (isSlotFree(lesson, day, period, grid, busyMap)) {
          validSlots.push({ day, period, pressureScore });
        }
      }
    }
  }

  // Sort by pressure score descending (prefer days with more teacher availability)
  validSlots.sort((a, b) => b.pressureScore - a.pressureScore);

  return validSlots;
}

/**
 * Calculate day pressure: How many free slots this teacher has on this day
 */
function calculateDayPressure(
  lesson: ScheduleLesson,
  day: string,
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig
): number {
  let freeSlots = 0;
  const { numberOfPeriods } = config;

  // Count free slots for each teacher on this day
  for (const teacherId of lesson.teacherIds) {
    for (let period = 1; period <= numberOfPeriods; period++) {
      const busyKey = `${teacherId}-${day}-${period}`;
      if (!busyMap.has(busyKey)) {
        freeSlots++;
      }
    }
  }

  return freeSlots;
}

/**
 * DEEP SWAP CHAIN: Attempt up to 3-level swap to make room
 * Level 0: Try placing lesson A
 * Level 1: If blocked by B, move B to alternative
 * Level 2: If B blocked by C, move C to alternative
 * Level 3: If C blocked by D, move D to alternative
 */
function attemptDeepSwapChain(
  newLesson: ScheduleLesson,
  targetSlot: SlotPosition,
  isDouble: boolean,
  tasks: ScheduleTask[],
  taskIndex: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  scheduledLessons: Set<string>,
  loadTracker: LoadTracker,
  config: ScheduleConfig,
  depth: number
): boolean {
  swapAttempts++;

  // Limit swap depth
  if (depth >= MAX_SWAP_DEPTH) {
    return false;
  }

  // Track if this is a deep chain (depth > 0)
  if (depth > 0) {
    deepSwapChains++;
  }

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

        // Check if same lesson (normalization)
        if (normalizeLessonName(newLesson.lessonName) === normalizeLessonName(conflictingLesson.lessonName)) {
          continue;
        }

        // Determine if conflicting lesson is double
        const isConflictDouble = existingSlot.slotType !== 'single';

        // Find alternative slots for conflicting lesson
        const alternativeSlots = findValidSlotsWithPressure(
          conflictingLesson,
          isConflictDouble,
          grid,
          busyMap,
          dailyLessonMap,
          loadTracker,
          config
        );

        // Try each alternative
        for (const altSlot of alternativeSlots) {
          // Don't swap to same slot
          if (altSlot.day === targetSlot.day && altSlot.period === targetSlot.period) {
            continue;
          }

          // Remove conflicting lesson
          const removalChanges = removeLesson(
            conflictingLessonId,
            targetSlot.day,
            period,
            grid,
            busyMap,
            dailyLessonMap,
            loadTracker
          );

          // Check if alternative slot is free or requires deeper swap
          const altConflicts = checkSlotConflicts(conflictingLesson, altSlot, isConflictDouble, grid, busyMap);
          
          if (!altConflicts.hasConflict && canScheduleOnDay(conflictingLesson, altSlot.day, dailyLessonMap)) {
            // Alternative is free: simple swap
            const altPlacementChanges = placeLesson(
              conflictingLesson,
              altSlot,
              isConflictDouble,
              grid,
              busyMap,
              dailyLessonMap,
              loadTracker
            );

            // Place new lesson in target slot
            const newPlacementChanges = placeLesson(newLesson, targetSlot, isDouble, grid, busyMap, dailyLessonMap, loadTracker);

            // Continue backtracking
            if (deepRepairBacktrack(tasks, taskIndex + 1, grid, busyMap, dailyLessonMap, scheduledLessons, loadTracker, config)) {
              scheduledLessons.add(newLesson._id);
              successfulSwaps++;
              if (depth === 0) {
                console.log(`🔄 Successful swap: ${conflictingLesson.lessonName} (${targetSlot.day}P${targetSlot.period} → ${altSlot.day}P${altSlot.period})`);
              } else {
                console.log(`🔄 Deep chain (L${depth + 1}): ${conflictingLesson.lessonName} (${targetSlot.day}P${targetSlot.period} → ${altSlot.day}P${altSlot.period})`);
              }
              return true;
            }

            // Undo if backtracking failed
            undoChanges(newPlacementChanges, grid, busyMap, dailyLessonMap, loadTracker);
            undoChanges(altPlacementChanges, grid, busyMap, dailyLessonMap, loadTracker);
            reapplyChanges(removalChanges, grid, busyMap, dailyLessonMap, loadTracker);
          } else if (depth < MAX_SWAP_DEPTH - 1) {
            // Alternative has conflict: try deeper swap chain
            const deeperSwap = attemptDeepSwapChain(
              conflictingLesson,
              altSlot,
              isConflictDouble,
              tasks,
              taskIndex,
              grid,
              busyMap,
              dailyLessonMap,
              scheduledLessons,
              loadTracker,
              config,
              depth + 1
            );

            if (deeperSwap) {
              // Deeper swap succeeded, now place new lesson
              const newPlacementChanges = placeLesson(newLesson, targetSlot, isDouble, grid, busyMap, dailyLessonMap, loadTracker);

              if (deepRepairBacktrack(tasks, taskIndex + 1, grid, busyMap, dailyLessonMap, scheduledLessons, loadTracker, config)) {
                scheduledLessons.add(newLesson._id);
                successfulSwaps++;
                return true;
              }

              undoChanges(newPlacementChanges, grid, busyMap, dailyLessonMap, loadTracker);
            } else {
              // Deeper swap failed, restore original
              reapplyChanges(removalChanges, grid, busyMap, dailyLessonMap, loadTracker);
            }
          } else {
            // Max depth reached, restore original
            reapplyChanges(removalChanges, grid, busyMap, dailyLessonMap, loadTracker);
          }
        }
      }
    }
  }

  return false;
}

/**
 * Normalize lesson names for comparison
 */
function normalizeLessonName(name: string): string {
  return name.replace(/\s*\/\s*/g, '/').toUpperCase().trim();
}

/**
 * Remove lesson from grid (for swapping)
 */
interface Change {
  type: 'grid' | 'busy' | 'daily' | 'load';
  key: string;
  value?: GridSlot | number;
}

function removeLesson(
  lessonId: string,
  day: string,
  period: number,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  loadTracker: LoadTracker
): Change[] {
  const changes: Change[] = [];
  const lesson = lessonMetadataCache.get(lessonId);

  if (!lesson) return changes;

  // Find all grid slots for this lesson on this day
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
  for (const [key] of busyMap.entries()) {
    if (key.includes(`-${day}-${period}`)) {
      changes.push({ type: 'busy', key });
      busyMap.delete(key);
    }
  }

  // Remove daily markers
  for (const [key] of dailyLessonMap.entries()) {
    if (key.includes(`-${day}-${lessonId}`)) {
      changes.push({ type: 'daily', key });
      dailyLessonMap.delete(key);
    }
  }

  // Update load tracker
  const periodsToRemove = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
  for (const teacherId of lesson.teacherIds) {
    const currentLoad = loadTracker.teacherLoads.get(teacherId) || 0;
    changes.push({ type: 'load', key: `teacher-${teacherId}`, value: currentLoad });
    loadTracker.teacherLoads.set(teacherId, currentLoad - periodsToRemove);
  }
  for (const classId of lesson.classIds) {
    const currentLoad = loadTracker.classLoads.get(classId) || 0;
    changes.push({ type: 'load', key: `class-${classId}`, value: currentLoad });
    loadTracker.classLoads.set(classId, currentLoad - periodsToRemove);
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
  dailyLessonMap: DailyLessonMap,
  loadTracker: LoadTracker
): void {
  for (const change of changes) {
    if (change.type === 'grid' && change.value && typeof change.value === 'object' && 'lessonId' in change.value) {
      grid.set(change.key, change.value);
    } else if (change.type === 'busy') {
      busyMap.set(change.key, true);
    } else if (change.type === 'daily') {
      dailyLessonMap.set(change.key, true);
    } else if (change.type === 'load' && typeof change.value === 'number') {
      const parts = change.key.split('-');
      const entityType = parts[0];
      const entityId = parts.slice(1).join('-');
      
      if (entityType === 'teacher') {
        loadTracker.teacherLoads.set(entityId, change.value);
      } else if (entityType === 'class') {
        loadTracker.classLoads.set(entityId, change.value);
      }
    }
  }
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
 * Place lesson in grid
 */
function placeLesson(
  lesson: ScheduleLesson,
  slot: SlotPosition,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  loadTracker: LoadTracker
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

  // Update load tracker
  const periodsToAdd = isDouble ? 2 : 1;
  for (const teacherId of lesson.teacherIds) {
    const currentLoad = loadTracker.teacherLoads.get(teacherId) || 0;
    changes.push({ type: 'load', key: `teacher-${teacherId}`, value: currentLoad });
    loadTracker.teacherLoads.set(teacherId, currentLoad + periodsToAdd);
  }
  for (const classId of lesson.classIds) {
    const currentLoad = loadTracker.classLoads.get(classId) || 0;
    changes.push({ type: 'load', key: `class-${classId}`, value: currentLoad });
    loadTracker.classLoads.set(classId, currentLoad + periodsToAdd);
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
  dailyLessonMap: DailyLessonMap,
  loadTracker: LoadTracker
): void {
  for (const change of changes) {
    if (change.type === 'grid') {
      grid.delete(change.key);
    } else if (change.type === 'busy') {
      busyMap.delete(change.key);
    } else if (change.type === 'daily') {
      dailyLessonMap.delete(change.key);
    } else if (change.type === 'load' && typeof change.value === 'number') {
      const parts = change.key.split('-');
      const entityType = parts[0];
      const entityId = parts.slice(1).join('-');
      
      if (entityType === 'teacher') {
        loadTracker.teacherLoads.set(entityId, change.value);
      } else if (entityType === 'class') {
        loadTracker.classLoads.set(entityId, change.value);
      }
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
 * Generate detailed diagnostic with explicit bottleneck reporting
 */
function generateDetailedDiagnostic(
  lesson: ScheduleLesson,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  loadTracker: LoadTracker,
  config: ScheduleConfig
): ConflictDiagnostic {
  const requiredPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
  
  let teacherBusyCount = 0;
  let classBusyCount = 0;
  let noDoubleSlotCount = 0;
  let dailyLimitCount = 0;

  const { daysOfWeek, numberOfPeriods, intervalSlots } = config;

  // Analyze conflicts
  for (const day of daysOfWeek) {
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
      for (const teacherId of lesson.teacherIds) {
        const busyKey = `${teacherId}-${day}-${period}`;
        if (busyMap.has(busyKey)) {
          teacherBusyCount++;
        }
      }

      for (const classId of lesson.classIds) {
        const gridKey = `${classId}-${day}-${period}`;
        if (grid.has(gridKey)) {
          classBusyCount++;
        }
      }

      // Check double slot availability
      if (lesson.numberOfDoubles > 0 && !validDoubleStarts.includes(period)) {
        noDoubleSlotCount++;
      }
    }
  }

  // Generate explicit failure reason with interval awareness
  let failureReason = '';
  
  // Check for interval barriers
  if (noDoubleSlotCount > 0 && lesson.numberOfDoubles > 0) {
    failureReason = `Interval barrier prevents double periods: Intervals after period(s) ${intervalSlots.join(', ')} block ${lesson.numberOfDoubles} required double period(s). Valid double starts: ${validDoubleStarts.join(', ')}.`;
  } else if (teacherBusyCount > classBusyCount) {
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
    if (busiestTeacher) {
      const teacherLoad = loadTracker.teacherLoads.get(busiestTeacher[0]) || 0;
      failureReason = `Teacher ${busiestTeacher[0]} is fully booked across all possible ${validDoubleStarts.length} double-period blocks (${busiestTeacher[1]} conflicts, ${teacherLoad} periods assigned). Consider reducing teacher workload or hiring additional staff.`;
    } else {
      failureReason = `Teachers are over-allocated. No available time slots for ${requiredPeriods} periods.`;
    }
  } else if (classBusyCount > 0) {
    const classLoad = Math.max(...lesson.classIds.map(id => loadTracker.classLoads.get(id) || 0));
    failureReason = `Classes are over-scheduled (${classLoad} periods assigned, approaching 35-period limit). Not enough free periods across the week for ${requiredPeriods} total periods.`;
  } else if (dailyLimitCount > 0) {
    failureReason = `Daily subject limit reached. Lesson already scheduled for some classes on multiple days. Try redistributing ${lesson.numberOfDoubles} doubles + ${lesson.numberOfSingles} singles across more days.`;
  } else {
    failureReason = `Unable to find valid time slots for ${requiredPeriods} periods (${lesson.numberOfDoubles} doubles + ${lesson.numberOfSingles} singles). All ${validDoubleStarts.length} valid double-period blocks are occupied or conflict with existing schedule.`;
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
 * Generate swap suggestions
 */
function generateSwapSuggestions(
  lesson: ScheduleLesson,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];
  const { daysOfWeek } = config;
  const isDouble = lesson.numberOfDoubles > 0;

  for (const day of daysOfWeek) {
    const periodsToCheck = isDouble ? validDoubleStarts : Array.from({ length: config.numberOfPeriods }, (_, i) => i + 1);

    for (const period of periodsToCheck) {
      const conflicts = checkSlotConflicts(lesson, { day, period }, isDouble, grid, busyMap);
      
      if (conflicts.busyClasses.length === 1 && conflicts.busyTeachers.length === 0) {
        const classId = conflicts.busyClasses[0];
        const gridKey = `${classId}-${day}-${period}`;
        const blockingSlot = grid.get(gridKey);

        if (blockingSlot) {
          const blockingLesson = lessonMetadataCache.get(blockingSlot.lessonId);
          if (blockingLesson) {
            const isBlockingDouble = blockingSlot.slotType !== 'single';
            const alternatives: SlotPosition[] = [];
            
            // Find alternatives for blocking lesson
            for (const altDay of daysOfWeek) {
              const altPeriods = isBlockingDouble ? validDoubleStarts : Array.from({ length: config.numberOfPeriods }, (_, i) => i + 1);
              for (const altPeriod of altPeriods) {
                if (altDay === day && altPeriod === period) continue;
                if (isSlotFree(blockingLesson, altDay, altPeriod, grid, busyMap)) {
                  alternatives.push({ day: altDay, period: altPeriod });
                }
              }
            }

            if (alternatives.length > 0) {
              suggestions.push({
                targetSlot: { day, period },
                conflictingLesson: {
                  lessonId: blockingLesson._id,
                  lessonName: blockingLesson.lessonName,
                },
                alternativeSlots: alternatives.slice(0, 3),
                swapFeasibility: alternatives.length >= 3 ? 'easy' : alternatives.length >= 2 ? 'moderate' : 'hard',
              });
            }
          }
        }
      }

      if (suggestions.length >= 5) break;
    }
    if (suggestions.length >= 5) break;
  }

  return suggestions;
}
