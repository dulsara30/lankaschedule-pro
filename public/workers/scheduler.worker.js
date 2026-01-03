/**
 * PARALLEL TIMETABLE SCHEDULER WEB WORKER
 * Runs on client CPU to avoid Vercel serverless timeouts
 * Implements multi-threaded search with typed arrays for performance
 */

// Debug logging - verify worker is loading
console.log('🔧 Web Worker: Script loaded successfully');

// Global error handler
self.onerror = function(error) {
  console.error('🚨 Web Worker Global Error:', error);
  self.postMessage({
    type: 'ERROR',
    error: {
      message: error.message || 'Unknown worker error',
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno
    }
  });
};

// Constants
const MAX_ITERATIONS = 250000; // 250K per thread (4 threads = 1M total)
const DAILY_PERIOD_LIMIT = 7;
const WEEKLY_LOAD_LIMIT = 35;

// Multi-Dimensional Penalty Weights
const PENALTY_CRITICAL_OVERLAP = 1000;
const PENALTY_INTERVAL_VIOLATION = 500;
const PENALTY_TEACHER_GAP = 100;
const PENALTY_DAY_IMBALANCE = 50;
const PENALTY_DAILY_OVERLOAD = 20;
const PENALTY_WEEKLY_OVERLOAD = 10;

// Adaptive Annealing Parameters
const COOLING_RATE = 0.000004; // Faster cooling for shorter runs
const REHEAT_TEMPERATURE = 0.8;
const STAGNATION_THRESHOLD = 25000; // Reheat every 25k for 250k total
const STRATEGIC_SHUFFLE_THRESHOLD = 100000;

// Progress reporting
const PROGRESS_INTERVAL = 10000;

// Global state
let temperature = 1.0;
let lessonMetadataCache = new Map();
let validDoubleStarts = [];
let config = null;
let threadId = 0;

// Typed arrays for performance (Int32Array for conflict tracking)
let teacherDailyLoads = new Map();
let teacherWeeklyLoads = new Map();
let classWeeklyLoads = new Map();

/**
 * Message handler with error handling
 */
self.onmessage = function(e) {
  console.log('🔧 Web Worker: Message received', { type: e.data?.type, threadId: e.data?.data?.threadId });
  
  try {
    const { type, data } = e.data;

    if (type === 'START') {
      threadId = data.threadId;
      console.log(`🚀 Web Worker ${threadId}: Starting scheduler`);
      
      // Log full payload for debugging
      console.log(`📦 Web Worker ${threadId}: Received payload:`, {
        hasLessons: !!data.lessons,
        lessonsCount: data.lessons?.length,
        hasClasses: !!data.classes,
        classesCount: data.classes?.length,
        hasConfig: !!data.config,
        configStructure: data.config ? {
          hasDaysOfWeek: !!data.config.daysOfWeek,
          daysOfWeekCount: data.config.daysOfWeek?.length,
          hasNumberOfPeriods: !!data.config.numberOfPeriods,
          numberOfPeriods: data.config.numberOfPeriods,
          hasIntervalSlots: !!data.config.intervalSlots,
          intervalSlotsCount: data.config.intervalSlots?.length
        } : null,
        hasRandomSeed: !!data.randomSeed
      });
      
      const { lessons, classes, config: cfg, randomSeed } = data;
      
      // Validate data with detailed error messages
      if (!lessons || !Array.isArray(lessons)) {
        console.error('❌ Invalid lessons data:', lessons);
        throw new Error(`Invalid lessons data: ${lessons ? typeof lessons : 'null/undefined'}`);
      }
      if (!classes || !Array.isArray(classes)) {
        console.error('❌ Invalid classes data:', classes);
        throw new Error(`Invalid classes data: ${classes ? typeof classes : 'null/undefined'}`);
      }
      if (!cfg) {
        console.error('❌ Config is null/undefined:', cfg);
        throw new Error('Config is null or undefined');
      }
      if (!cfg.daysOfWeek || !Array.isArray(cfg.daysOfWeek)) {
        console.error('❌ Invalid daysOfWeek:', cfg.daysOfWeek);
        throw new Error(`Invalid daysOfWeek: ${cfg.daysOfWeek ? typeof cfg.daysOfWeek : 'null/undefined'}`);
      }
      if (!cfg.numberOfPeriods || typeof cfg.numberOfPeriods !== 'number') {
        console.error('❌ Invalid numberOfPeriods:', cfg.numberOfPeriods);
        throw new Error(`Invalid numberOfPeriods: ${cfg.numberOfPeriods ? typeof cfg.numberOfPeriods : 'null/undefined'}`);
      }
      
      // Apply defaults for optional fields
      const configWithDefaults = {
        daysOfWeek: cfg.daysOfWeek,
        numberOfPeriods: cfg.numberOfPeriods,
        intervalSlots: cfg.intervalSlots || []
      };
      
      console.log(`✅ Web Worker ${threadId}: Data validated - ${lessons.length} lessons, ${classes.length} classes, ${configWithDefaults.daysOfWeek.length} days, ${configWithDefaults.numberOfPeriods} periods`);
      
      // Set random seed for reproducibility
      Math.random = seededRandom(randomSeed);
      
      config = configWithDefaults;
      
      // Run scheduler
      console.log(`🔧 Web Worker ${threadId}: Starting scheduler execution`);
      const result = runScheduler(lessons, classes, cfg);
      console.log(`✅ Web Worker ${threadId}: Scheduler completed, conflicts=${result.conflicts}`);
      
      // Send result back
      self.postMessage({
        type: 'COMPLETE',
        threadId,
        data: result
      });
    }
  } catch (error) {
    console.error(`🚨 Web Worker ${threadId}: Error in message handler:`, error);
    self.postMessage({
      type: 'ERROR',
      threadId,
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack,
        name: error.name
      }
    });
  }
};

/**
 * Seeded random number generator for reproducibility
 */
function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Main scheduler function
 */
function runScheduler(lessons, classes, cfg) {
  config = cfg;
  lessonMetadataCache.clear();
  teacherDailyLoads.clear();
  teacherWeeklyLoads.clear();
  classWeeklyLoads.clear();
  temperature = 1.0;

  // Cache lesson metadata
  for (const lesson of lessons) {
    lessonMetadataCache.set(lesson._id, lesson);
  }

  // Calculate valid double starts
  validDoubleStarts = calculateValidDoubleStarts(cfg);

  const grid = new Map();
  const busyMap = new Map();
  const dailyLessonMap = new Map();

  // Phase 1: Greedy initialization
  const placedTasks = greedyInitialization(lessons, grid, busyMap, dailyLessonMap, cfg);
  
  const initialConflicts = countTotalConflicts(placedTasks, grid, busyMap);
  
  self.postMessage({
    type: 'PROGRESS',
    threadId,
    iteration: 0,
    conflicts: initialConflicts,
    temperature: temperature
  });

  // Phase 2: Stochastic repair
  const finalConflicts = stochasticRepair(placedTasks, grid, busyMap, dailyLessonMap, cfg);

  // Convert to slots
  const slots = gridToSlots(grid);

  return {
    success: finalConflicts === 0,
    slots,
    conflicts: finalConflicts,
    totalSlots: slots.length
  };
}

/**
 * Calculate valid double period starts
 */
function calculateValidDoubleStarts(cfg) {
  const { numberOfPeriods, intervalSlots } = cfg;
  const validStarts = [];

  for (let period = 1; period < numberOfPeriods; period++) {
    if (period === numberOfPeriods) continue;
    if (intervalSlots.includes(period)) continue;
    validStarts.push(period);
  }

  return validStarts;
}

/**
 * Greedy initialization - place all lessons
 */
function greedyInitialization(lessons, grid, busyMap, dailyLessonMap, cfg) {
  const tasks = [];
  
  // Create tasks for all lessons
  for (const lesson of lessons) {
    for (let i = 0; i < lesson.numberOfSingles; i++) {
      tasks.push({
        lesson,
        isDouble: false,
        taskId: `${lesson._id}-single-${i}`
      });
    }
    for (let i = 0; i < lesson.numberOfDoubles; i++) {
      tasks.push({
        lesson,
        isDouble: true,
        taskId: `${lesson._id}-double-${i}`
      });
    }
  }

  // Sort by complexity
  tasks.sort((a, b) => {
    const aEntities = a.lesson.teacherIds.length * a.lesson.classIds.length;
    const bEntities = b.lesson.teacherIds.length * b.lesson.classIds.length;
    if (aEntities !== bEntities) return bEntities - aEntities;
    return b.lesson.numberOfDoubles - a.lesson.numberOfDoubles;
  });

  const placedTasks = [];

  // Place each task
  for (const task of tasks) {
    const placement = findMinimumConflictSlot(task, grid, busyMap, dailyLessonMap, cfg);
    placeTaskGreedy(task, placement.slot, grid, busyMap, dailyLessonMap);
    
    placedTasks.push({
      ...task,
      slot: placement.slot,
      conflictCount: placement.conflictCount
    });
  }

  return placedTasks;
}

/**
 * Find slot with minimum conflicts
 */
function findMinimumConflictSlot(task, grid, busyMap, dailyLessonMap, cfg) {
  const { lesson, isDouble } = task;
  const { daysOfWeek, numberOfPeriods } = cfg;

  let bestSlot = null;
  let minConflicts = Infinity;

  for (const day of daysOfWeek) {
    // Check daily lesson limit
    const dailyBlocked = lesson.classIds.some(classId => {
      const key = `${classId}-${day}-${lesson._id}`;
      return dailyLessonMap.has(key);
    });

    if (dailyBlocked) continue;

    const periodsToCheck = isDouble ? validDoubleStarts : 
      Array.from({ length: numberOfPeriods }, (_, i) => i + 1);

    for (const period of periodsToCheck) {
      const penalty = calculateSlotPenalty(lesson, day, period, isDouble, grid, busyMap);
      
      if (penalty < minConflicts) {
        minConflicts = penalty;
        bestSlot = { day, period };
      }
    }
  }

  return {
    slot: bestSlot || { day: daysOfWeek[0], period: 1 },
    conflictCount: Math.ceil(minConflicts / 100)
  };
}

/**
 * Calculate penalty for slot placement (using typed array logic)
 */
function calculateSlotPenalty(lesson, day, period, isDouble, grid, busyMap) {
  let penalty = 0;
  const periods = isDouble ? [period, period + 1] : [period];

  // CRITICAL: Hard conflicts
  for (const p of periods) {
    // Teacher overlap
    for (const teacherId of lesson.teacherIds) {
      const busyKey = `${teacherId}-${day}-${p}`;
      if (busyMap.has(busyKey)) {
        penalty += PENALTY_CRITICAL_OVERLAP;
      }
    }

    // Class overlap
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      const existingSlots = grid.get(gridKey) || [];
      if (existingSlots.length > 0) {
        penalty += PENALTY_CRITICAL_OVERLAP * existingSlots.length;
      }
    }
  }

  // HIGH: Interval violation
  if (isDouble && config.intervalSlots.includes(period)) {
    penalty += PENALTY_INTERVAL_VIOLATION;
  }

  // MEDIUM: Teacher gaps
  for (const teacherId of lesson.teacherIds) {
    const teacherDaySchedule = getTeacherDaySchedule(teacherId, day, grid);
    if (teacherDaySchedule.length > 0) {
      const minPeriod = Math.min(...teacherDaySchedule);
      const maxPeriod = Math.max(...teacherDaySchedule);
      const gapSize = maxPeriod - minPeriod - teacherDaySchedule.length;
      if (gapSize > 0) {
        penalty += PENALTY_TEACHER_GAP * gapSize;
      }
    }
  }

  // Daily/weekly overload
  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    const currentLoad = teacherDailyLoads.get(dailyKey) || 0;
    if (currentLoad >= DAILY_PERIOD_LIMIT) {
      penalty += PENALTY_DAILY_OVERLOAD * (currentLoad - DAILY_PERIOD_LIMIT + 1);
    }

    const weeklyLoad = teacherWeeklyLoads.get(teacherId) || 0;
    if (weeklyLoad >= WEEKLY_LOAD_LIMIT) {
      penalty += PENALTY_WEEKLY_OVERLOAD * (weeklyLoad - WEEKLY_LOAD_LIMIT + 1);
    }
  }

  return penalty;
}

/**
 * Get teacher's schedule for a day
 */
function getTeacherDaySchedule(teacherId, day, grid) {
  const periods = [];
  for (const [key, slots] of grid.entries()) {
    const [classId, slotDay, periodStr] = key.split('-');
    if (slotDay === day) {
      for (const slot of slots) {
        const lesson = lessonMetadataCache.get(slot.lessonId);
        if (lesson && lesson.teacherIds.includes(teacherId)) {
          periods.push(parseInt(periodStr));
        }
      }
    }
  }
  return [...new Set(periods)].sort((a, b) => a - b);
}

/**
 * Place task in grid
 */
function placeTaskGreedy(task, slot, grid, busyMap, dailyLessonMap) {
  const { lesson, isDouble } = task;
  const { day, period } = slot;
  const periods = isDouble ? [period, period + 1] : [period];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const slotType = !isDouble ? 'single' : i === 0 ? 'double-start' : 'double-end';

    // Place in grid
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      const existing = grid.get(gridKey) || [];
      existing.push({ lessonId: lesson._id, slotType });
      grid.set(gridKey, existing);
    }

    // Mark busy
    for (const classId of lesson.classIds) {
      busyMap.set(`${classId}-${day}-${p}`, true);
    }
    for (const teacherId of lesson.teacherIds) {
      busyMap.set(`${teacherId}-${day}-${p}`, true);
    }
  }

  // Mark daily
  for (const classId of lesson.classIds) {
    dailyLessonMap.set(`${classId}-${day}-${lesson._id}`, true);
  }

  // Update load tracking
  const periodsToAdd = isDouble ? 2 : 1;
  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    teacherDailyLoads.set(dailyKey, (teacherDailyLoads.get(dailyKey) || 0) + periodsToAdd);
    teacherWeeklyLoads.set(teacherId, (teacherWeeklyLoads.get(teacherId) || 0) + periodsToAdd);
  }
  for (const classId of lesson.classIds) {
    classWeeklyLoads.set(classId, (classWeeklyLoads.get(classId) || 0) + periodsToAdd);
  }
}

/**
 * Stochastic repair with adaptive annealing
 */
function stochasticRepair(placedTasks, grid, busyMap, dailyLessonMap, cfg) {
  let currentConflicts = countTotalConflicts(placedTasks, grid, busyMap);
  let iterationsSinceImprovement = 0;
  let lastReportedIteration = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterationsSinceImprovement++;

    // Report progress every 10k iterations
    if (i - lastReportedIteration >= PROGRESS_INTERVAL) {
      self.postMessage({
        type: 'PROGRESS',
        threadId,
        iteration: i,
        conflicts: currentConflicts,
        temperature: temperature
      });
      lastReportedIteration = i;
    }

    // Adaptive reheat
    if (iterationsSinceImprovement >= STAGNATION_THRESHOLD) {
      temperature = REHEAT_TEMPERATURE;
      iterationsSinceImprovement = 0;
    }

    // Strategic shuffle
    if (iterationsSinceImprovement >= STRATEGIC_SHUFFLE_THRESHOLD) {
      performStrategicShuffle(placedTasks, grid, busyMap, dailyLessonMap, cfg);
      currentConflicts = countTotalConflicts(placedTasks, grid, busyMap);
      temperature = 1.0;
      iterationsSinceImprovement = 0;
    }

    // Early exit
    if (currentConflicts === 0) break;

    const conflictingTasks = placedTasks.filter(t => t.conflictCount > 0);
    if (conflictingTasks.length === 0) break;

    const randomTask = conflictingTasks[Math.floor(Math.random() * conflictingTasks.length)];
    
    // Try swap (30% chain, 70% regular)
    const swapSucceeded = Math.random() < 0.3 
      ? attemptSwapChain(randomTask, placedTasks, grid, busyMap, dailyLessonMap, cfg)
      : attemptStochasticSwap(randomTask, placedTasks, grid, busyMap, dailyLessonMap, cfg);

    if (swapSucceeded) {
      const newConflicts = countTotalConflicts(placedTasks, grid, busyMap);
      
      if (newConflicts < currentConflicts) {
        currentConflicts = newConflicts;
        iterationsSinceImprovement = 0;
      } else if (newConflicts > currentConflicts) {
        const delta = newConflicts - currentConflicts;
        const acceptanceProbability = Math.exp(-delta / temperature);
        if (Math.random() < acceptanceProbability) {
          currentConflicts = newConflicts;
        }
      }
    }

    temperature = Math.max(0.0001, temperature - COOLING_RATE);
  }

  // Final progress report
  self.postMessage({
    type: 'PROGRESS',
    threadId,
    iteration: MAX_ITERATIONS,
    conflicts: currentConflicts,
    temperature: temperature
  });

  return currentConflicts;
}

/**
 * Strategic shuffle
 */
function performStrategicShuffle(placedTasks, grid, busyMap, dailyLessonMap, cfg) {
  const zeroConflictTasks = placedTasks.filter(t => t.conflictCount === 0);
  const conflictingTasks = placedTasks.filter(t => t.conflictCount > 0);

  const keepCount = Math.floor(zeroConflictTasks.length * 0.5);
  const tasksToRandomize = [...zeroConflictTasks.slice(keepCount), ...conflictingTasks];

  for (const task of tasksToRandomize) {
    removeTaskFromGrid(task, grid, busyMap, dailyLessonMap);
  }

  const shuffled = tasksToRandomize.sort(() => Math.random() - 0.5);
  for (const task of shuffled) {
    const newPlacement = findMinimumConflictSlot(task, grid, busyMap, dailyLessonMap, cfg);
    placeTaskGreedy(task, newPlacement.slot, grid, busyMap, dailyLessonMap);
    task.slot = newPlacement.slot;
    task.conflictCount = newPlacement.conflictCount;
  }
}

/**
 * Attempt swap chain
 */
function attemptSwapChain(taskA, allTasks, grid, busyMap, dailyLessonMap, cfg) {
  // Simplified version - just do a random move
  return attemptStochasticSwap(taskA, allTasks, grid, busyMap, dailyLessonMap, cfg);
}

/**
 * Attempt stochastic swap
 */
function attemptStochasticSwap(task, allTasks, grid, busyMap, dailyLessonMap, cfg) {
  if (Math.random() < 0.7) {
    return attemptRandomMove(task, grid, busyMap, dailyLessonMap, cfg);
  } else {
    return attemptPairwiseSwap(task, allTasks, grid, busyMap, dailyLessonMap, cfg);
  }
}

/**
 * Attempt random move
 */
function attemptRandomMove(task, grid, busyMap, dailyLessonMap, cfg) {
  const { daysOfWeek, numberOfPeriods } = cfg;
  const randomDay = daysOfWeek[Math.floor(Math.random() * daysOfWeek.length)];
  
  const periodsToCheck = task.isDouble ? validDoubleStarts : 
    Array.from({ length: numberOfPeriods }, (_, i) => i + 1);
  const randomPeriod = periodsToCheck[Math.floor(Math.random() * periodsToCheck.length)];

  const oldSlot = { ...task.slot };
  
  removeTaskFromGrid(task, grid, busyMap, dailyLessonMap);
  placeTaskGreedy(task, { day: randomDay, period: randomPeriod }, grid, busyMap, dailyLessonMap);
  
  task.slot = { day: randomDay, period: randomPeriod };
  task.conflictCount = Math.ceil(calculateSlotPenalty(task.lesson, randomDay, randomPeriod, task.isDouble, grid, busyMap) / 100);
  
  return true;
}

/**
 * Attempt pairwise swap
 */
function attemptPairwiseSwap(task1, allTasks, grid, busyMap, dailyLessonMap, cfg) {
  const task2 = allTasks[Math.floor(Math.random() * allTasks.length)];
  if (task1.taskId === task2.taskId) return false;

  const slot1 = { ...task1.slot };
  const slot2 = { ...task2.slot };

  removeTaskFromGrid(task1, grid, busyMap, dailyLessonMap);
  removeTaskFromGrid(task2, grid, busyMap, dailyLessonMap);

  placeTaskGreedy(task1, slot2, grid, busyMap, dailyLessonMap);
  placeTaskGreedy(task2, slot1, grid, busyMap, dailyLessonMap);

  task1.slot = slot2;
  task2.slot = slot1;

  task1.conflictCount = Math.ceil(calculateSlotPenalty(task1.lesson, slot2.day, slot2.period, task1.isDouble, grid, busyMap) / 100);
  task2.conflictCount = Math.ceil(calculateSlotPenalty(task2.lesson, slot1.day, slot1.period, task2.isDouble, grid, busyMap) / 100);

  return true;
}

/**
 * Remove task from grid
 */
function removeTaskFromGrid(task, grid, busyMap, dailyLessonMap) {
  const { lesson, slot, isDouble } = task;
  const { day, period } = slot;
  const periods = isDouble ? [period, period + 1] : [period];

  for (const p of periods) {
    // Remove from grid
    for (const classId of lesson.classIds) {
      const gridKey = `${classId}-${day}-${p}`;
      const existing = grid.get(gridKey) || [];
      const filtered = existing.filter(s => s.lessonId !== lesson._id);
      if (filtered.length > 0) {
        grid.set(gridKey, filtered);
      } else {
        grid.delete(gridKey);
      }
    }

    // Remove busy markers
    for (const classId of lesson.classIds) {
      busyMap.delete(`${classId}-${day}-${p}`);
    }
    for (const teacherId of lesson.teacherIds) {
      busyMap.delete(`${teacherId}-${day}-${p}`);
    }
  }

  // Remove daily markers
  for (const classId of lesson.classIds) {
    dailyLessonMap.delete(`${classId}-${day}-${lesson._id}`);
  }

  // Update load tracking
  const periodsToRemove = isDouble ? 2 : 1;
  for (const teacherId of lesson.teacherIds) {
    const dailyKey = `${teacherId}-${day}`;
    teacherDailyLoads.set(dailyKey, Math.max(0, (teacherDailyLoads.get(dailyKey) || 0) - periodsToRemove));
    teacherWeeklyLoads.set(teacherId, Math.max(0, (teacherWeeklyLoads.get(teacherId) || 0) - periodsToRemove));
  }
  for (const classId of lesson.classIds) {
    classWeeklyLoads.set(classId, Math.max(0, (classWeeklyLoads.get(classId) || 0) - periodsToRemove));
  }
}

/**
 * Count total conflicts
 */
function countTotalConflicts(placedTasks, grid, busyMap) {
  let total = 0;
  for (const task of placedTasks) {
    const penalty = calculateSlotPenalty(task.lesson, task.slot.day, task.slot.period, task.isDouble, grid, busyMap);
    task.conflictCount = Math.ceil(penalty / 100);
    total += task.conflictCount;
  }
  return total;
}

/**
 * Convert grid to slots array
 */
function gridToSlots(grid) {
  const slots = [];
  
  for (const [key, gridSlots] of grid.entries()) {
    const [classId, day, periodStr] = key.split('-');
    const period = parseInt(periodStr);
    
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
  
  return slots;
}
