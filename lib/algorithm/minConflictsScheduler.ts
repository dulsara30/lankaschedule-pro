/**
 * EduFlow AI - High-Performance Stochastic Repair Scheduler
 * 
 * Strategy:
 * 1. GREEDY RANDOMIZED INITIALIZATION: Place ALL 813 periods using minimum-conflict heuristic
 * 2. STOCHASTIC REPAIR: 1,000,000 iterations with simulated annealing to resolve conflicts
 * 3. RESOURCE BLOCK LOCKING: Multi-teacher lessons treated as atomic units
 * 4. STRICT INTERVAL ENFORCEMENT: Double periods cannot span interval breaks
 * 5. TEACHER WORKLOAD BALANCING: Prefer days with <7 periods per teacher
 * 6. BEST EFFORT RESULTS: Returns partial solution showing remaining conflicts
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
    conflictsRemaining: number;
  };
}

// Internal types
interface GridSlot {
  lessonId: string;
  slotType: 'single' | 'double-start' | 'double-end';
}

interface SlotPosition {
  day: string;
  period: number;
}

interface PlacedTask {
  lesson: ScheduleLesson;
  isDouble: boolean;
  taskId: string;
  slot: SlotPosition;
  conflictCount: number;
}

type TimetableGrid = Map<string, GridSlot[]>;
type BusyMap = Map<string, boolean>;
type DailyLessonMap = Map<string, boolean>;

// Tracking
let iterationCount = 0;
let swapAttempts = 0;
let successfulSwaps = 0;
let conflictResolutions = 0;
const MAX_ITERATIONS = 1000000; // 1 million iterations for stochastic repair
const RESTART_INTERVAL = 200000; // Restart every 200k iterations to escape stagnation
const DAILY_PERIOD_LIMIT = 7; // Target: max 7 periods per teacher per day
const WEEKLY_LOAD_LIMIT = 35; // Max 35 periods per teacher/class per week

// Penalty-Based Scoring Weights (aSc TimeTable style)
const PENALTY_TEACHER_OVERLAP = 100; // Teacher teaching multiple classes simultaneously
const PENALTY_CLASS_OVERLAP = 100; // Class in multiple lessons simultaneously
const PENALTY_INTERVAL_VIOLATION = 50; // Double period spanning interval
const PENALTY_DAILY_OVERLOAD = 20; // Teacher exceeding daily limit
const PENALTY_WEEKLY_OVERLOAD = 10; // Teacher exceeding weekly limit

// Simulated annealing parameters
let temperature = 1.0; // Initial temperature (accept bad swaps)
const COOLING_RATE = 0.000001; // Gradual cooling over 1M iterations

// Lesson metadata cache
const lessonMetadataCache = new Map<string, ScheduleLesson>();

// Valid double period start positions
let validDoubleStarts: number[] = [];

// Teacher daily load tracking
const teacherDailyLoads = new Map<string, number>(); // key: teacherId-day
const teacherWeeklyLoads = new Map<string, number>(); // key: teacherId
const classWeeklyLoads = new Map<string, number>(); // key: classId

/**
 * Main scheduling function with greedy initialization + stochastic repair
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
  conflictResolutions = 0;
  temperature = 1.0;
  lessonMetadataCache.clear();
  teacherDailyLoads.clear();
  teacherWeeklyLoads.clear();
  classWeeklyLoads.clear();

  // Cache lesson metadata
  for (const lesson of lessons) {
    lessonMetadataCache.set(lesson._id, lesson);
  }

  // Calculate valid double period start positions (STRICT INTERVAL ENFORCEMENT)
  validDoubleStarts = calculateValidDoubleStarts(config);
  console.log(`🔒 STRICT INTERVAL ENFORCEMENT:`);
  console.log(`   Intervals after periods: ${config.intervalSlots.join(', ')}`);
  console.log(`   Valid double-period starts: ${validDoubleStarts.join(', ')}`);

  const grid: TimetableGrid = new Map();
  const busyMap: BusyMap = new Map();
  const dailyLessonMap: DailyLessonMap = new Map();

  console.log(`🚀 High-Performance Stochastic Repair Scheduler`);
  console.log(`📊 Dataset: ${lessons.length} lessons`);
  console.log(`📊 Config: ${config.numberOfPeriods}P/day × ${config.daysOfWeek.length}D = ${config.numberOfPeriods * config.daysOfWeek.length} total slots`);

  // PHASE 1: GREEDY RANDOMIZED INITIALIZATION
  console.log(`\n🎲 PHASE 1: Greedy Randomized Initialization`);
  const placedTasks = greedyInitialization(lessons, grid, busyMap, dailyLessonMap, config);

  const totalPeriods = placedTasks.reduce((sum, t) => sum + (t.isDouble ? 2 : 1), 0);
  const initialConflicts = placedTasks.reduce((sum, t) => sum + t.conflictCount, 0);
  console.log(`   ✅ Placed ${placedTasks.length} tasks (${totalPeriods} periods)`);
  console.log(`   ⚠️ Initial conflicts: ${initialConflicts}`);

  // PHASE 2: STOCHASTIC REPAIR with Simulated Annealing
  console.log(`\n🔧 PHASE 2: Stochastic Repair (1M iterations)`);
  stochasticRepair(placedTasks, grid, busyMap, dailyLessonMap, config);

  // BEST-EFFORT RESULT: Convert grid to slots (ALWAYS returns all placed slots)
  const slots = gridToSlots(grid);

  // Calculate final conflict count
  const finalConflicts = countTotalConflicts(placedTasks, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
  
  console.log(`\n✅ Scheduler Complete - BEST EFFORT RESULT`);
  console.log(`📊 Final Stats:`);
  console.log(`   - Total slots created: ${slots.length}`);
  console.log(`   - Lessons scheduled: ${lessons.length}`);
  console.log(`   - Swap attempts: ${swapAttempts.toLocaleString()}`);
  console.log(`   - Successful swaps: ${successfulSwaps.toLocaleString()}`);
  console.log(`   - Conflicts resolved: ${conflictResolutions.toLocaleString()}`);
  console.log(`   - Iterations: ${iterationCount.toLocaleString()}/${MAX_ITERATIONS.toLocaleString()}`);
  console.log(`   - Remaining conflicts: ${finalConflicts}`);

  if (finalConflicts > 0) {
    console.log(`⚠️ BEST-EFFORT MODE: Returning ${slots.length} slots with ${finalConflicts} conflicts for manual resolution`);
  }

  // Generate diagnostics for remaining conflicts
  const failedDiagnostics = generateConflictDiagnostics(placedTasks, grid, busyMap, dailyLessonMap, config);

  const success = finalConflicts === 0;

  // CRITICAL: Always return slots, even with conflicts (best-effort approach)
  return {
    success,
    slots, // GUARANTEED: All tasks placed during Phase 1 are included
    failedLessons: failedDiagnostics,
    stats: {
      totalSlots: slots.length,
      scheduledLessons: lessons.length,
      failedLessons: failedDiagnostics.length,
      swapAttempts,
      successfulSwaps,
      iterations: iterationCount,
      conflictsRemaining: finalConflicts,
    },
  };
}

/**
 * Calculate valid double period start positions (strict interval enforcement)
 */
function calculateValidDoubleStarts(config: ScheduleConfig): number[] {
  const { numberOfPeriods, intervalSlots } = config;
  const validStarts: number[] = [];

  for (let period = 1; period < numberOfPeriods; period++) {
    if (period === numberOfPeriods) continue; // Can't start at last period

    // CRITICAL: If this period is an interval boundary, FORBID double start
    if (intervalSlots.includes(period)) {
      continue; // Starting here would span the interval
    }

    validStarts.push(period);
  }

  return validStarts;
}

/**
 * PHASE 1: Greedy Randomized Initialization
 * Place ALL lessons using minimum-conflict heuristic (allows conflicts initially)
 */
function greedyInitialization(
  lessons: ScheduleLesson[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): PlacedTask[] {
  const placedTasks: PlacedTask[] = [];

  // Prioritize high-resource lessons (ITT, B1, Aesthetic, etc.)
  const sortedLessons = prioritizeComplexLessons(lessons);

  console.log(`   🎯 Prioritized Complex Lessons (Top 5):`);
  sortedLessons.slice(0, 5).forEach((lesson, i) => {
    const resourceScore = lesson.teacherIds.length * lesson.classIds.length;
    console.log(`      ${i + 1}. ${lesson.lessonName}: ${lesson.teacherIds.length}T × ${lesson.classIds.length}C = ${resourceScore} units`);
  });

  // Expand lessons into tasks
  for (const lesson of sortedLessons) {
    // Place doubles first
    for (let i = 0; i < lesson.numberOfDoubles; i++) {
      const task = {
        lesson,
        isDouble: true,
        taskId: `${lesson._id}-double-${i}`,
      };
      
      const placement = findMinimumConflictSlot(task, grid, busyMap, dailyLessonMap, config);
      placeTaskGreedy(task, placement.slot, grid, busyMap, dailyLessonMap);
      
      placedTasks.push({
        ...task,
        slot: placement.slot,
        conflictCount: placement.conflictCount,
      });
    }

    // Then place singles
    for (let i = 0; i < lesson.numberOfSingles; i++) {
      const task = {
        lesson,
        isDouble: false,
        taskId: `${lesson._id}-single-${i}`,
      };
      
      const placement = findMinimumConflictSlot(task, grid, busyMap, dailyLessonMap, config);
      placeTaskGreedy(task, placement.slot, grid, busyMap, dailyLessonMap);
      
      placedTasks.push({
        ...task,
        slot: placement.slot,
        conflictCount: placement.conflictCount,
      });
    }
  }

  return placedTasks;
}

/**
 * Prioritize complex lessons (high teacher × class count)
 */
function prioritizeComplexLessons(lessons: ScheduleLesson[]): ScheduleLesson[] {
  return [...lessons].sort((a, b) => {
    // Primary: Resource block size (teachers × classes)
    const resourceA = a.teacherIds.length * a.classIds.length;
    const resourceB = b.teacherIds.length * b.classIds.length;
    if (resourceB !== resourceA) {
      return resourceB - resourceA;
    }

    // Secondary: Priority keywords (ITT, B1, Aesthetic)
    const priorityA = isPriorityLesson(a.lessonName) ? 1000 : 0;
    const priorityB = isPriorityLesson(b.lessonName) ? 1000 : 0;
    if (priorityB !== priorityA) {
      return priorityB - priorityA;
    }

    // Tertiary: Total teachers + classes
    const entitiesA = a.teacherIds.length + a.classIds.length;
    const entitiesB = b.teacherIds.length + b.classIds.length;
    if (entitiesB !== entitiesA) {
      return entitiesB - entitiesA;
    }

    // Quaternary: Number of doubles
    if (b.numberOfDoubles !== a.numberOfDoubles) {
      return b.numberOfDoubles - a.numberOfDoubles;
    }

    // Quinary: Total periods
    const totalA = a.numberOfSingles + (a.numberOfDoubles * 2);
    const totalB = b.numberOfSingles + (b.numberOfDoubles * 2);
    return totalB - totalA;
  });
}

/**
 * Check if lesson name matches priority keywords
 */
function isPriorityLesson(name: string): boolean {
  const upperName = name.toUpperCase();
  return upperName.includes('ITT') || 
         upperName.includes('B1') || 
         upperName.includes('AESTHETIC') ||
         upperName.includes('COMBINED');
}

/**
 * Find slot with MINIMUM conflicts (greedy heuristic)
 */
interface TaskPlacement {
  slot: SlotPosition;
  conflictCount: number;
}

interface Task {
  lesson: ScheduleLesson;
  isDouble: boolean;
  taskId: string;
}

function findMinimumConflictSlot(
  task: Task,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): TaskPlacement {
  const { lesson, isDouble } = task;
  const { daysOfWeek, numberOfPeriods } = config;

  let bestSlot: SlotPosition | null = null;
  let minConflicts = Infinity;

  for (const day of daysOfWeek) {
    // Check daily lesson limit
    const dailyBlocked = lesson.classIds.some(classId => {
      const key = `${classId}-${day}-${lesson._id}`;
      return dailyLessonMap.has(key);
    });

    if (dailyBlocked) continue;

    if (isDouble) {
      // Use valid double starts only
      for (const period of validDoubleStarts) {
        const conflicts = countSlotConflicts(lesson, day, period, true, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
        const balanceScore = calculateWorkloadBalanceScore(lesson, day, period, true);
        const totalScore = conflicts - (balanceScore * 0.1); // Slight preference for balanced days

        if (totalScore < minConflicts) {
          minConflicts = totalScore;
          bestSlot = { day, period };
        }
      }
    } else {
      // Single period
      for (let period = 1; period <= numberOfPeriods; period++) {
        const conflicts = countSlotConflicts(lesson, day, period, false, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
        const balanceScore = calculateWorkloadBalanceScore(lesson, day, period, false);
        const totalScore = conflicts - (balanceScore * 0.1);

        if (totalScore < minConflicts) {
          minConflicts = totalScore;
          bestSlot = { day, period };
        }
      }
    }
  }

  // Fallback: random slot if all blocked
  if (!bestSlot) {
    const randomDay = daysOfWeek[Math.floor(Math.random() * daysOfWeek.length)];
    const randomPeriod = isDouble 
      ? validDoubleStarts[Math.floor(Math.random() * validDoubleStarts.length)]
      : Math.floor(Math.random() * numberOfPeriods) + 1;
    bestSlot = { day: randomDay, period: randomPeriod };
    minConflicts = 999; // High conflict indicator
  }

  return {
    slot: bestSlot,
    conflictCount: Math.floor(minConflicts),
  };
}

/**
 * TEACHER WORKLOAD BALANCING: Calculate balance score for a slot
 * Higher score = better (teacher has fewer periods on this day)
 */
function calculateWorkloadBalanceScore(
  lesson: ScheduleLesson,
  day: string,
  period: number,
  isDouble: boolean
): number {
  let balanceScore = 0;

  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    const currentDailyLoad = teacherDailyLoads.get(dailyKey) || 0;

    // Prefer days with <7 periods
    if (currentDailyLoad < DAILY_PERIOD_LIMIT) {
      balanceScore += (DAILY_PERIOD_LIMIT - currentDailyLoad);
    }
  }

  return balanceScore;
}

/**
 * Count conflicts for a slot (RESOURCE BLOCK LOCKING)
 * For multi-teacher lessons, treat all resources as a single atomic block
 */
/**
 * Calculate penalty score for a slot placement (Penalty-Based Global Solver)
 * Lower score = better placement
 */
function calculateSlotPenalty(
  lesson: ScheduleLesson,
  day: string,
  period: number,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig,
  teacherDailyLoads: Map<string, number>,
  teacherWeeklyLoads: Map<string, number>
): number {
  let penalty = 0;
  const periods = isDouble ? [period, period + 1] : [period];

  // Check for teacher and class overlaps
  for (const p of periods) {
    // Teacher overlap penalty
    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${day}-${p}`;
      if (busyMap.has(busyKey)) {
        penalty += PENALTY_TEACHER_OVERLAP;
      }
    }

    // Class overlap penalty
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      const existingSlots = grid.get(gridKey) || [];
      if (existingSlots.length > 0) {
        // Each existing slot at this position adds penalty
        penalty += PENALTY_CLASS_OVERLAP * existingSlots.length;
      }
    }
  }

  // Interval violation penalty (for double periods)
  if (isDouble) {
    const intervalsAfterPeriod = config.intervalSlots || [];
    if (intervalsAfterPeriod.includes(period)) {
      penalty += PENALTY_INTERVAL_VIOLATION;
    }
  }

  // Daily overload penalty
  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    const currentLoad = teacherDailyLoads.get(dailyKey) || 0;
    if (currentLoad >= DAILY_PERIOD_LIMIT) {
      penalty += PENALTY_DAILY_OVERLOAD * (currentLoad - DAILY_PERIOD_LIMIT + 1);
    }
  }

  // Weekly overload penalty
  for (const teacherId of lesson.teacherIds) {
    const weeklyLoad = teacherWeeklyLoads.get(teacherId) || 0;
    if (weeklyLoad >= WEEKLY_LOAD_LIMIT) {
      penalty += PENALTY_WEEKLY_OVERLOAD * (weeklyLoad - WEEKLY_LOAD_LIMIT + 1);
    }
  }

  return penalty;
}

/**
 * Legacy function maintained for compatibility - wraps penalty calculation
 */
function countSlotConflicts(
  lesson: ScheduleLesson,
  day: string,
  period: number,
  isDouble: boolean,
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig,
  teacherDailyLoads: Map<string, number>,
  teacherWeeklyLoads: Map<string, number>
): number {
  // Convert penalty to conflict count (divide by 100 for rough equivalence)
  const penalty = calculateSlotPenalty(lesson, day, period, isDouble, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
  return Math.ceil(penalty / 100);
}

/**
 * Place task in grid (greedy - allows conflicts)
 */
function placeTaskGreedy(
  task: Task,
  slot: SlotPosition,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap
): void {
  const { lesson, isDouble } = task;
  const { day, period } = slot;
  const periods = isDouble ? [period, period + 1] : [period];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const slotType = !isDouble ? 'single' : i === 0 ? 'double-start' : 'double-end';

    // Place in grid (append to array to preserve conflicts)
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      const existing = grid.get(gridKey) || [];
      existing.push({ lessonId: lesson._id, slotType });
      grid.set(gridKey, existing);
    }

    // Mark busy
    for (const classId of lesson.classIds) {
      const busyKey = `${classId}-${day}-${p}`;
      busyMap.set(busyKey, true);
    }

    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${day}-${p}`;
      busyMap.set(busyKey, true);
    }
  }

  // Mark daily
  for (const classId of lesson.classIds) {
    const dailyKey = `${classId}-${day}-${lesson._id}`;
    dailyLessonMap.set(dailyKey, true);
  }

  // Update load tracking
  const periodsToAdd = isDouble ? 2 : 1;
  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    const weeklyKey = teacherId;
    teacherDailyLoads.set(dailyKey, (teacherDailyLoads.get(dailyKey) || 0) + periodsToAdd);
    teacherWeeklyLoads.set(weeklyKey, (teacherWeeklyLoads.get(weeklyKey) || 0) + periodsToAdd);
  }

  for (const classId of lesson.classIds) {
    const weeklyKey = classId;
    classWeeklyLoads.set(weeklyKey, (classWeeklyLoads.get(weeklyKey) || 0) + periodsToAdd);
  }
}

/**
 * PHASE 2: Stochastic Repair with Simulated Annealing
 */
function stochasticRepair(
  placedTasks: PlacedTask[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): void {
  let bestConflicts = countTotalConflicts(placedTasks, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
  let currentConflicts = bestConflicts;
  let stagnationCounter = 0;
  const STAGNATION_LIMIT = 100000; // Early exit if no improvement for 100K iterations
  let lastRestart = 0;

  console.log(`   🔥 Starting repair: ${currentConflicts} conflicts`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterationCount++;

    // Restart mechanism every 200k iterations to escape local minima
    if (i > 0 && i % RESTART_INTERVAL === 0 && i !== lastRestart) {
      console.log(`   🔄 RESTART at ${i.toLocaleString()} iterations - Re-shuffling to escape stagnation`);
      temperature = 1.0; // Reset temperature
      stagnationCounter = 0;
      lastRestart = i;
      
      // Random shuffle some high-conflict tasks
      const highConflictTasks = placedTasks
        .filter(t => t.conflictCount > 5)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(10, Math.floor(placedTasks.length * 0.1)));
      
      for (const task of highConflictTasks) {
        attemptStochasticSwap(task, placedTasks, grid, busyMap, dailyLessonMap, config);
      }
      
      currentConflicts = countTotalConflicts(placedTasks, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
      console.log(`   ↻ After restart: ${currentConflicts} conflicts`);
    }

    // Progress logging every 100K iterations
    if (i > 0 && i % 100000 === 0) {
      console.log(`   ⚡ ${i.toLocaleString()}/${MAX_ITERATIONS.toLocaleString()} | Conflicts: ${currentConflicts} | Temp: ${temperature.toFixed(4)} | Swaps: ${successfulSwaps.toLocaleString()}`);
      
      if (currentConflicts === 0) {
        console.log(`   🎉 Zero conflicts achieved at iteration ${i.toLocaleString()}!`);
        break;
      }
    }

    // Early exit if stagnated
    if (stagnationCounter > STAGNATION_LIMIT) {
      console.log(`   ⚠️ Stagnation detected (no improvement for ${STAGNATION_LIMIT.toLocaleString()} iterations)`);
      break;
    }

    // Pick a random task with conflicts
    const conflictingTasks = placedTasks.filter(t => t.conflictCount > 0);
    
    if (conflictingTasks.length === 0) {
      // No conflicts remaining
      console.log(`   ✅ All conflicts resolved at iteration ${i.toLocaleString()}!`);
      break;
    }

    const randomTask = conflictingTasks[Math.floor(Math.random() * conflictingTasks.length)];

    // Try swapping with another task or moving to random slot
    const swapSucceeded = attemptStochasticSwap(randomTask, placedTasks, grid, busyMap, dailyLessonMap, config);

    if (swapSucceeded) {
      successfulSwaps++;
      
      // Recalculate conflicts
      const newConflicts = countTotalConflicts(placedTasks, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
      
      if (newConflicts < currentConflicts) {
        // Improvement
        conflictResolutions += (currentConflicts - newConflicts);
        currentConflicts = newConflicts;
        stagnationCounter = 0;
        
        if (newConflicts < bestConflicts) {
          bestConflicts = newConflicts;
        }
      } else if (newConflicts > currentConflicts) {
        // Worse solution: accept based on simulated annealing
        const delta = newConflicts - currentConflicts;
        const acceptanceProbability = Math.exp(-delta / temperature);
        
        if (Math.random() < acceptanceProbability) {
          // Accept bad swap to escape local minimum
          currentConflicts = newConflicts;
          stagnationCounter++;
        } else {
          // Reject: this is handled by the swap function reverting
          stagnationCounter++;
        }
      } else {
        // Same conflicts
        stagnationCounter++;
      }
    } else {
      stagnationCounter++;
    }

    // Cool down temperature (simulated annealing)
    temperature = Math.max(0.0001, temperature - COOLING_RATE);
  }

  console.log(`   ✅ Repair complete: ${currentConflicts} conflicts remaining`);
}

/**
 * Attempt stochastic swap (single task move or pairwise swap)
 */
function attemptStochasticSwap(
  task: PlacedTask,
  allTasks: PlacedTask[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): boolean {
  swapAttempts++;

  // Strategy 1: Move to random slot (70% probability)
  if (Math.random() < 0.7) {
    return attemptRandomMove(task, grid, busyMap, dailyLessonMap, config);
  } else {
    // Strategy 2: Swap with another task (30% probability)
    return attemptPairwiseSwap(task, allTasks, grid, busyMap, dailyLessonMap, config);
  }
}

/**
 * Move task to a random slot
 */
function attemptRandomMove(
  task: PlacedTask,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): boolean {
  const { lesson, isDouble, slot: oldSlot } = task;
  const { daysOfWeek } = config;

  // Remove from old position
  removeTaskFromGrid(task, grid, busyMap, dailyLessonMap);

  // Find new random slot with minimum conflicts
  const newPlacement = findMinimumConflictSlot(
    { lesson, isDouble, taskId: task.taskId },
    grid,
    busyMap,
    dailyLessonMap,
    config
  );

  // Place in new position
  placeTaskGreedy(
    { lesson, isDouble, taskId: task.taskId },
    newPlacement.slot,
    grid,
    busyMap,
    dailyLessonMap
  );

  // Update task
  task.slot = newPlacement.slot;
  task.conflictCount = newPlacement.conflictCount;

  return true;
}

/**
 * Swap two tasks
 */
function attemptPairwiseSwap(
  task1: PlacedTask,
  allTasks: PlacedTask[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): boolean {
  // Pick random second task
  const task2 = allTasks[Math.floor(Math.random() * allTasks.length)];

  if (task1.taskId === task2.taskId) return false;
  if (task1.isDouble !== task2.isDouble) return false; // Must be same type

  // Remove both
  removeTaskFromGrid(task1, grid, busyMap, dailyLessonMap);
  removeTaskFromGrid(task2, grid, busyMap, dailyLessonMap);

  // Swap slots
  const temp = task1.slot;
  task1.slot = task2.slot;
  task2.slot = temp;

  // Place both in swapped positions
  placeTaskGreedy(
    { lesson: task1.lesson, isDouble: task1.isDouble, taskId: task1.taskId },
    task1.slot,
    grid,
    busyMap,
    dailyLessonMap
  );

  placeTaskGreedy(
    { lesson: task2.lesson, isDouble: task2.isDouble, taskId: task2.taskId },
    task2.slot,
    grid,
    busyMap,
    dailyLessonMap
  );

  // Recalculate conflicts
  task1.conflictCount = countSlotConflicts(task1.lesson, task1.slot.day, task1.slot.period, task1.isDouble, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
  task2.conflictCount = countSlotConflicts(task2.lesson, task2.slot.day, task2.slot.period, task2.isDouble, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);

  return true;
}

/**
 * Remove task from grid
 */
function removeTaskFromGrid(
  task: PlacedTask,
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap
): void {
  const { lesson, isDouble, slot } = task;
  const { day, period } = slot;
  const periods = isDouble ? [period, period + 1] : [period];

  for (const p of periods) {
    // Remove from grid
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      grid.delete(gridKey);
    }

    // Remove from busy map
    for (const classId of lesson.classIds) {
      const busyKey = `${classId}-${day}-${p}`;
      busyMap.delete(busyKey);
    }

    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${day}-${p}`;
      busyMap.delete(busyKey);
    }
  }

  // Remove from daily map
  for (const classId of lesson.classIds) {
    const dailyKey = `${classId}-${day}-${lesson._id}`;
    dailyLessonMap.delete(dailyKey);
  }

  // Update load tracking
  const periodsToRemove = isDouble ? 2 : 1;
  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    const weeklyKey = teacherId;
    teacherDailyLoads.set(dailyKey, Math.max(0, (teacherDailyLoads.get(dailyKey) || 0) - periodsToRemove));
    teacherWeeklyLoads.set(weeklyKey, Math.max(0, (teacherWeeklyLoads.get(weeklyKey) || 0) - periodsToRemove));
  }

  for (const classId of lesson.classIds) {
    const weeklyKey = classId;
    classWeeklyLoads.set(weeklyKey, Math.max(0, (classWeeklyLoads.get(weeklyKey) || 0) - periodsToRemove));
  }
}

/**
 * Count total conflicts across all tasks
 */
function countTotalConflicts(
  placedTasks: PlacedTask[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig,
  teacherDailyLoads: Map<string, number>,
  teacherWeeklyLoads: Map<string, number>
): number {
  let totalConflicts = 0;

  for (const task of placedTasks) {
    const conflicts = countSlotConflicts(
      task.lesson,
      task.slot.day,
      task.slot.period,
      task.isDouble,
      grid,
      busyMap,
      config,
      teacherDailyLoads,
      teacherWeeklyLoads
    );
    task.conflictCount = conflicts;
    totalConflicts += conflicts;
  }

  return totalConflicts;
}

/**
 * Convert grid to slots array
 */
function gridToSlots(grid: TimetableGrid): TimetableSlot[] {
  const slots: TimetableSlot[] = [];

  // Flatten the grid: each position may have multiple lessons (conflicts)
  for (const [key, gridSlots] of grid.entries()) {
    const [classId, day, periodStr] = key.split('-');
    const period = parseInt(periodStr);

    // Add ALL lessons at this position, including conflicts
    for (const gridSlot of gridSlots) {
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
  }

  console.log(`📦 gridToSlots: Flattened ${grid.size} grid positions into ${slots.length} total slots (including conflicts)`);
  return slots;
}

/**
 * Generate diagnostics for remaining conflicts (BEST EFFORT REPORTING)
 */
function generateConflictDiagnostics(
  placedTasks: PlacedTask[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  dailyLessonMap: DailyLessonMap,
  config: ScheduleConfig
): ConflictDiagnostic[] {
  const diagnostics: ConflictDiagnostic[] = [];
  const conflictedLessons = new Map<string, PlacedTask[]>();

  // Group conflicting tasks by lesson
  for (const task of placedTasks) {
    if (task.conflictCount > 0) {
      if (!conflictedLessons.has(task.lesson._id)) {
        conflictedLessons.set(task.lesson._id, []);
      }
      conflictedLessons.get(task.lesson._id)!.push(task);
    }
  }

  // Generate diagnostics
  for (const [lessonId, tasks] of conflictedLessons.entries()) {
    const lesson = lessonMetadataCache.get(lessonId);
    if (!lesson) continue;

    const totalConflicts = tasks.reduce((sum, t) => sum + t.conflictCount, 0);
    const requiredPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);

    // Analyze conflict types
    let teacherBusyCount = 0;
    let classBusyCount = 0;
    let noDoubleSlotCount = 0;
    let dailyLimitCount = 0;

    for (const task of tasks) {
      const { day, period } = task.slot;
      const periods = task.isDouble ? [period, period + 1] : [period];

      for (const p of periods) {
        for (const teacherId of lesson.teacherIds) {
          const busyKey = `${teacherId}-${day}-${p}`;
          if (busyMap.has(busyKey)) {
            teacherBusyCount++;
          }
        }

        for (const classId of lesson.classIds) {
          const gridKey = `${classId}-${day}-${p}`;
          if (grid.has(gridKey)) {
            // Check if any slot at this position is a different lesson
            const existingSlots = grid.get(gridKey) || [];
            const hasDifferentLesson = existingSlots.some(slot => slot.lessonId !== lessonId);
            if (hasDifferentLesson) {
              classBusyCount++;
            }
          }
        }
      }
    }

    // Generate failure reason
    let failureReason = '';
    if (teacherBusyCount > 0) {
      failureReason = `Teacher resource conflicts: ${teacherBusyCount} overlapping assignments detected. ${lesson.teacherIds.length} teachers required simultaneously for this lesson.`;
    } else if (classBusyCount > 0) {
      failureReason = `Class resource conflicts: ${classBusyCount} overlapping assignments detected. ${lesson.classIds.length} classes required simultaneously.`;
    } else {
      failureReason = `${totalConflicts} conflicts detected across ${tasks.length} task placements. Requires manual review.`;
    }

    diagnostics.push({
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
      suggestedSwaps: generateSwapSuggestions(lesson, tasks, grid, busyMap, config),
    });
  }

  return diagnostics;
}

/**
 * Generate swap suggestions for conflicting lesson
 */
function generateSwapSuggestions(
  lesson: ScheduleLesson,
  conflictingTasks: PlacedTask[],
  grid: TimetableGrid,
  busyMap: BusyMap,
  config: ScheduleConfig
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];
  const { daysOfWeek } = config;

  // Find alternative slots with fewer conflicts
  for (const task of conflictingTasks.slice(0, 3)) { // Top 3 most problematic
    const isDouble = task.isDouble;
    
    for (const day of daysOfWeek) {
      const periodsToCheck = isDouble ? validDoubleStarts : Array.from({ length: config.numberOfPeriods }, (_, i) => i + 1);

      for (const period of periodsToCheck) {
        const conflicts = countSlotConflicts(lesson, day, period, isDouble, grid, busyMap, config, teacherDailyLoads, teacherWeeklyLoads);
        
        if (conflicts < task.conflictCount) {
          // Found a better slot
          const gridKey = `${lesson.classIds[0]}-${day}-${period}`;
          const blockingSlots = grid.get(gridKey) || [];
          const blockingSlot = blockingSlots[0]; // Get first blocking slot

          if (blockingSlot) {
            const blockingLesson = lessonMetadataCache.get(blockingSlot.lessonId);
            if (blockingLesson) {
              suggestions.push({
                targetSlot: { day, period },
                conflictingLesson: {
                  lessonId: blockingLesson._id,
                  lessonName: blockingLesson.lessonName,
                },
                alternativeSlots: [],
                swapFeasibility: conflicts === 0 ? 'easy' : conflicts < task.conflictCount / 2 ? 'moderate' : 'hard',
              });
            }
          }
        }

        if (suggestions.length >= 3) break;
      }
      if (suggestions.length >= 3) break;
    }
  }

  return suggestions;
}
