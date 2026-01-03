/**
 * SERVER ACTION: Generate Timetable using Python CP-SAT Solver
 * 
 * This server action replaces the TypeScript algorithm with a professional-grade
 * Python solver using Google OR-Tools CP-SAT. It fetches the optimized timetable
 * from the Python FastAPI service and saves it to MongoDB.
 */

'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import School from '@/models/School';
import Subject from '@/models/Subject';
import Teacher from '@/models/Teacher';
import Lesson from '@/models/Lesson';
import Class from '@/models/Class';
import TimetableSlot from '@/models/TimetableSlot';

interface SolverResponse {
  success: boolean;
  slots: Array<{
    classId: string;
    lessonId: string;
    day: string;
    periodNumber: number;
    isDoubleStart: boolean;
    isDoubleEnd: boolean;
  }>;
  conflicts: number;
  solvingTime: number;
  stats: {
    totalLessons: number;
    totalTasks: number;
    singlesCreated: number;
    doublesCreated: number;
    constraintsAdded: number;
  };
  message: string;
}

export interface GenerateTimetableResult {
  success: boolean;
  message: string;
  stats?: {
    totalSlots: number;
    scheduledLessons: number;
    failedLessons: number;
    swapAttempts?: number;
    successfulSwaps?: number;
    iterations?: number;
    recursions?: number;
  };
  slotsPlaced?: number;
  totalSlots?: number;
  conflicts?: number;
  solvingTime?: number;
  currentStep?: number;
  totalSteps?: number;
}

export async function generateTimetableAction(): Promise<GenerateTimetableResult> {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 GENERATING TIMETABLE WITH CP-SAT SOLVER");
    console.log("=".repeat(60));

    await dbConnect();

    // Force model registration to prevent MissingSchemaError
    [Subject, Teacher, Class, Lesson, School, TimetableSlot].forEach(m => m?.modelName);

    // Step 1: Fetch school configuration
    console.log("\n📊 Step 1: Fetching school configuration...");
    const school = await School.findOne();
    if (!school) {
      return {
        success: false,
        message: 'School configuration not found. Please complete school setup first.',
      };
    }

    console.log(`[DEBUG] Fetched School: ${school.name}`);
    console.log(`[DEBUG] School ID: ${school._id}`);
    console.log(`[DEBUG] Raw Config:`, JSON.stringify(school.config, null, 2));

    // CRITICAL: daysOfWeek is NOT in the DB schema, so we hardcode it
    // The school operates Monday-Friday (5 days)
    const HARDCODED_DAYS = [
      { name: "Monday", abbreviation: "Mon" },
      { name: "Tuesday", abbreviation: "Tue" },
      { name: "Wednesday", abbreviation: "Wed" },
      { name: "Thursday", abbreviation: "Thu" },
      { name: "Friday", abbreviation: "Fri" },
    ];

    // Build config with robust fallbacks
    const config = {
      daysOfWeek: HARDCODED_DAYS, // Always use hardcoded 5-day week
      numberOfPeriods: school.config?.numberOfPeriods || 7, // Default to 7 if missing
      intervalSlots: school.config?.intervalSlots || [{ afterPeriod: 3, duration: 15 }],
      startTime: school.config?.startTime || '07:30',
      periodDuration: school.config?.periodDuration || 50,
    };

    console.log(`[DEBUG] Config found. Working Days: ${config.daysOfWeek.length}`);
    console.log(`[DEBUG] Number of Periods: ${config.numberOfPeriods}`);
    console.log(`[DEBUG] Interval Slots:`, config.intervalSlots);
    console.log(`✅ Config validated: ${config.daysOfWeek.length} days, ${config.numberOfPeriods} periods`);

    // Step 2: Fetch all lessons and classes
    console.log("\n📊 Step 2: Fetching lessons and classes...");
    
    const [lessonsData, classesData] = await Promise.all([
      Lesson.find({ schoolId: school._id }).lean(),
      Class.find({ schoolId: school._id }).lean(),
    ]);

    if (!lessonsData || lessonsData.length === 0) {
      return {
        success: false,
        message: 'No lessons found. Please create lessons before generating timetable.',
      };
    }

    if (!classesData || classesData.length === 0) {
      return {
        success: false,
        message: 'No classes found. Please create classes before generating timetable.',
      };
    }

    console.log(`✅ Fetched ${lessonsData.length} lessons, ${classesData.length} classes`);

    // Step 3: Prepare payload for Python solver
    console.log("\n📦 Step 3: Preparing payload for Python solver...");
    console.log("[DEBUG] Starting Payload Mapping for Python Solver...");
    
    const payload = {
      lessons: lessonsData.map((lesson: any) => ({
        _id: lesson._id.toString(),
        lessonName: lesson.lessonName,
        subjectIds: lesson.subjectIds.map((id: any) => id.toString()),
        teacherIds: lesson.teacherIds.map((id: any) => id.toString()),
        classIds: lesson.classIds.map((id: any) => id.toString()),
        numberOfSingles: lesson.numberOfSingles || 0,
        numberOfDoubles: lesson.numberOfDoubles || 0,
        color: lesson.color || "#3B82F6",
      })),
      classes: classesData.map((cls: any) => ({
        _id: cls._id.toString(),
        name: cls.name,
        grade: cls.grade,
      })),
      config: {
        numberOfPeriods: config.numberOfPeriods || 7, // Ensure default
        intervalSlots: (config.intervalSlots || []).map((slot: any) => ({
          afterPeriod: slot?.afterPeriod || 0,
          duration: slot?.duration || 15,
        })),
        daysOfWeek: (config.daysOfWeek || []).map((day: any) => ({
          name: day?.name || (typeof day === "string" ? day : "Monday"),
          abbreviation: day?.abbreviation || (typeof day === "string" ? day.slice(0, 3) : "Mon"),
        })),
      },
    };

    console.log(`[DEBUG] Payload prepared successfully`);
    console.log(`[DEBUG] Lessons in payload: ${payload.lessons.length}`);
    console.log(`[DEBUG] Classes in payload: ${payload.classes.length}`);
    console.log(`[DEBUG] Days in config payload: ${payload.config.daysOfWeek.length}`);
    console.log(`[DEBUG] Periods in config payload: ${payload.config.numberOfPeriods}`);

    // Calculate expected slots
    const expectedSlots = lessonsData.reduce((total: number, lesson: any) => {
      const classCount = lesson.classIds.length;
      const singleSlots = (lesson.numberOfSingles || 0) * classCount;
      const doubleSlots = (lesson.numberOfDoubles || 0) * classCount * 2; // Double periods = 2 slots
      return total + singleSlots + doubleSlots;
    }, 0);

    console.log(`✅ Payload prepared: ${payload.lessons.length} lessons, ${payload.classes.length} classes`);
    console.log(`🎯 Target: ${expectedSlots} slots`);

    // Step 4: Call Python solver
    console.log("\n🔧 Step 4: Calling Python CP-SAT solver...");
    console.log("[DEBUG] Solver URL:", process.env.SOLVER_URL || "http://localhost:8000");
    console.log("[DEBUG] Payload size:", JSON.stringify(payload).length, "bytes");
    console.log("📍 Endpoint: http://localhost:8000/solve");
    
    const solverUrl = process.env.SOLVER_URL || "http://localhost:8000";
    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(`${solverUrl}/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        // 90 second timeout (solver has 60s limit + buffer)
        signal: AbortSignal.timeout(90000),
      });
    } catch (fetchError: any) {
      if (fetchError.name === "TimeoutError") {
        return {
          success: false,
          message: "Solver timeout (90s). The problem may be too complex. Try reducing the number of lessons or constraints.",
        };
      }
      return {
        success: false,
        message: `Failed to connect to Python solver at ${solverUrl}. Ensure solver.py is running on port 8000. Error: ${fetchError.message}`,
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Solver API error (${response.status}): ${errorText}`,
      };
    }

    const result: SolverResponse = await response.json();
    const apiTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Solver completed in ${apiTime}s`);
    console.log(`📊 Result: ${result?.slots?.length || 0} slots generated`);
    console.log(`⚠️  Conflicts: ${result?.conflicts || 0}`);
    console.log(`📈 Stats:`, result?.stats);
    console.log(`💬 Message: ${result?.message}`);

    // Step 5: Validate result
    console.log("\n🔍 Step 5: Validating solution...");
    
    if (!result?.success) {
      return {
        success: false,
        message: `Solver failed: ${result?.message || 'Unknown error'}`,
      };
    }

    if (!result?.slots || result.slots.length === 0) {
      return {
        success: false,
        message: "Solver returned no slots. The problem may be over-constrained.",
      };
    }

    // Check if we got the expected number of slots
    const slotsCount = result.slots?.length || 0;
    const slotCoverage = ((slotsCount / expectedSlots) * 100).toFixed(1);
    console.log(`✅ Solution coverage: ${slotsCount}/${expectedSlots} slots (${slotCoverage}%)`);

    if (slotsCount < expectedSlots * 0.9) {
      console.warn(`⚠️  WARNING: Only ${slotCoverage}% of slots were placed. Some lessons may be missing.`);
    }

    // Step 6: Clear existing timetable
    console.log("\n🗑️  Step 6: Clearing existing timetable...");
    
    const deleteResult = await TimetableSlot.deleteMany({ schoolId: school._id });
    console.log(`✅ Deleted ${deleteResult.deletedCount} old slots`);

    // Step 7: Save new timetable to MongoDB
    console.log("\n💾 Step 7: Saving timetable to MongoDB...");
    
    // Deduplicate slots (safety net)
    const slotMap = new Map<string, any>();
    result.slots.forEach((slot) => {
      const key = `${slot.classId}-${slot.day}-${slot.periodNumber}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          schoolId: school._id,
          classId: slot.classId,
          lessonId: slot.lessonId,
          day: slot.day,
          periodNumber: slot.periodNumber,
          isDoubleStart: slot.isDoubleStart,
          isDoubleEnd: slot.isDoubleEnd,
        });
      } else {
        console.warn(`⚠️  Duplicate slot detected and skipped: ${key}`);
      }
    });

    const deduplicatedSlots = Array.from(slotMap.values());
    console.log(`🔍 Deduplication: ${result?.slots?.length || 0} → ${deduplicatedSlots.length} slots`);

    // Batch insert
    const insertResult = await TimetableSlot.insertMany(deduplicatedSlots, {
      ordered: false, // Continue on duplicate key errors
    });

    console.log(`✅ Inserted ${insertResult.length} slots successfully`);

    // Step 8: Revalidate paths
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    // Step 9: Final summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ TIMETABLE GENERATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`⏱️  Total time: ${apiTime}s`);
    console.log(`📊 Slots saved: ${insertResult.length}/${expectedSlots}`);
    console.log(`⚠️  Conflicts: ${result.conflicts} (CP-SAT guarantees 0)`);
    console.log(`🎯 Coverage: ${slotCoverage}%`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      message: `Timetable generated successfully! ${insertResult.length}/${expectedSlots} slots placed (${slotCoverage}% coverage).`,
      slotsPlaced: insertResult.length,
      totalSlots: expectedSlots,
      conflicts: result.conflicts,
      solvingTime: result.solvingTime,
      stats: {
        totalSlots: insertResult.length,
        scheduledLessons: result.stats.totalTasks,
        failedLessons: expectedSlots - insertResult.length,
        swapAttempts: 0,
        successfulSwaps: 0,
        iterations: result.stats.constraintsAdded,
        recursions: 0,
      },
    };
  } catch (error: any) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ TIMETABLE GENERATION FAILED");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("=".repeat(60) + "\n");

    return {
      success: false,
      message: `Failed to generate timetable: ${error.message}`,
      stats: {
        totalSlots: 0,
        scheduledLessons: 0,
        failedLessons: 0,
      },
    };
  }
}
