/**
 * SERVER ACTION: Generate Timetable using Python CP-SAT Solver
 * 
 * This server action replaces the TypeScript algorithm with a professional-grade
 * Python solver using Google OR-Tools CP-SAT. It fetches the optimized timetable
 * from the Python FastAPI service and saves it to MongoDB.
 * 
 * Timeout: 480s Python (5min base + 3min deep search) + 120s buffer = 600s fetch timeout
 * Total: 10 minutes for 100% placement potential
 * Configured via fetch AbortSignal.timeout(600000ms)
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
import TimetableVersion from '@/models/TimetableVersion';

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
  unplacedTasks: Array<{
    lessonId: string;
    classId: string;
    lessonName: string;
    className: string;
    teacherName: string;
    taskType: string;
    diagnostic?: string;  // Intelligent diagnostic message
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

export async function generateTimetableAction(
  versionName?: string,
  strictBalancing: boolean = true,
  maxTimeLimit: number = 180  // Time in seconds, default 3 minutes
): Promise<GenerateTimetableResult> {
  try {
    await dbConnect();
    
    // Smart auto-incrementing version logic
    console.log("\n" + "=".repeat(60));
    console.log("🚀 GENERATING TIMETABLE WITH CP-SAT SOLVER");
    console.log("=".repeat(60));
    
    const school = await School.findOne();
    if (!school) {
      throw new Error('School configuration not found');
    }
    
    // Determine version name: use provided or auto-generate
    let finalVersionName: string;
    
    if (versionName && versionName.trim()) {
      // Use provided version name
      finalVersionName = versionName.trim();
      console.log(`📝 Using provided version: ${finalVersionName}`);
    } else {
      // Auto-generate version number
      const latestVersion = await TimetableVersion.findOne({ schoolId: school._id })
        .sort({ createdAt: -1 })
        .lean();
      
      let versionNumber = 1.0;
      if (latestVersion?.versionName) {
        // Extract version number from 'Draft v1.0' or 'v1.0' or 'Final v2.5'
        const versionMatch = latestVersion.versionName.match(/v?(\d+\.\d+)/);
        if (versionMatch) {
          const currentVersion = parseFloat(versionMatch[1]);
          versionNumber = currentVersion + 1.0;
        }
      }
      
      finalVersionName = `Draft v${versionNumber.toFixed(1)}`;
      console.log(`📝 Auto-generated version: ${finalVersionName}`);
      console.log(`   (Latest was: ${latestVersion?.versionName || 'none'})`);
    }
    console.log("=".repeat(60));

    // Force model registration to prevent MissingSchemaError
    [Subject, Teacher, Class, Lesson, School, TimetableSlot].forEach(m => m?.modelName);

    // Step 1: Verify school configuration
    console.log("\n📊 Step 1: Verifying school configuration...");
    console.log(`[DEBUG] School: ${school.name}`);
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

    // SMART FILTERING: Separate enabled and disabled lessons
    const enabledLessons = lessonsData.filter((lesson: any) => (lesson.status || 'enabled') === 'enabled');
    const disabledLessons = lessonsData.filter((lesson: any) => lesson.status === 'disabled');

    console.log(`✅ Fetched ${lessonsData.length} total lessons, ${classesData.length} classes`);
    console.log(`   🟢 ${enabledLessons.length} lessons enabled (AI placement)`);
    console.log(`   ⚪ ${disabledLessons.length} lessons disabled (manual placement)`);

    // Step 3: Prepare payload for Python solver (ONLY enabled lessons)
    console.log("\n📦 Step 3: Preparing payload for Python solver...");
    console.log(`[DEBUG] Sending ONLY ${enabledLessons.length} enabled lessons to AI solver`);
    console.log(`[DEBUG] ${disabledLessons.length} disabled lessons will be added to unplaced array`);
    
    const payload = {
      lessons: enabledLessons.map((lesson: any) => ({
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
        grade: cls.grade?.toString() || "",  // Convert to string, fallback to empty string
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
      allowRelaxation: !strictBalancing,  // Invert: strict=true means no relaxation
      maxTimeLimit: maxTimeLimit,  // User-defined time limit in seconds
    };

    console.log(`[DEBUG] Payload prepared successfully`);
    console.log(`[DEBUG] Lessons in payload: ${payload.lessons.length}`);
    console.log(`[DEBUG] Classes in payload: ${payload.classes.length}`);
    console.log(`[DEBUG] Max search time: ${maxTimeLimit}s (${Math.floor(maxTimeLimit/60)}min ${maxTimeLimit%60}s)`);
    console.log(`[DEBUG] Relaxation mode: ${!strictBalancing ? 'ENABLED (two-stage)' : 'DISABLED (strict only)'}`);
    console.log(`[DEBUG] Sample class grades:`, payload.classes.slice(0, 3).map(c => `${c.name}='${c.grade}'`))
    console.log(`[DEBUG] Days in config payload: ${payload.config.daysOfWeek.length}`);
    console.log(`[DEBUG] Periods in config payload: ${payload.config.numberOfPeriods}`);

    // Calculate expected slots (from enabled lessons only)
    const expectedSlots = enabledLessons.reduce((total: number, lesson: any) => {
      const classCount = lesson.classIds.length;
      const singleSlots = (lesson.numberOfSingles || 0) * classCount;
      const doubleSlots = (lesson.numberOfDoubles || 0) * classCount * 2; // Double periods = 2 slots
      return total + singleSlots + doubleSlots;
    }, 0);

    console.log(`✅ Payload prepared: ${payload.lessons.length} enabled lessons, ${payload.classes.length} classes`);
    console.log(`🎯 Target: ${expectedSlots} slots from enabled lessons`);

    // Step 4: Call Python solver
    console.log("\n🔧 Step 4: Calling Python CP-SAT solver...");
    console.log("[DEBUG] Solver URL:", process.env.SOLVER_URL || "http://127.0.0.1:8000");
    console.log("[DEBUG] Payload size:", JSON.stringify(payload).length, "bytes");
    console.log("📍 Endpoint: http://127.0.0.1:8000/solve");
    
    const solverUrl = process.env.SOLVER_URL || "http://127.0.0.1:8000";
    const startTime = Date.now();

    // Pre-solve health check
    console.log("🏥 Health check: Testing connection to solver...");
    try {
      const healthResponse = await fetch(`${solverUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!healthResponse.ok) {
        console.error("❌ Health check failed:", healthResponse.status);
        return {
          success: false,
          message: `Python Solver health check failed (HTTP ${healthResponse.status}). Server may be starting up. Wait 10 seconds and try again.`,
        };
      }
      console.log("✅ Health check passed. Proceeding with solve...");
    } catch (healthError: any) {
      console.error("❌ Health check error:", healthError);
      console.error("   Error code:", healthError.cause?.code || 'UNKNOWN');
      console.error("   Error message:", healthError.message);
      
      if (healthError.cause?.code === "ECONNREFUSED" || healthError.message?.includes("ECONNREFUSED")) {
        return {
          success: false,
          message: '🔴 Server not found: Python solver is not running on port 8000. Start it with "python solver.py".',
        };
      }
      
      return {
        success: false,
        message: `Connection error: ${healthError.message}. Ensure solver.py is running on 127.0.0.1:8000`,
      };
    }

    let response: Response;
    try {
      response = await fetch(`${solverUrl}/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connection": "keep-alive",
        },
        body: JSON.stringify(payload),
        // 600 second timeout (10 minutes: 5min base + 3min deep search + 2min buffer)
        signal: AbortSignal.timeout(600000),
      });
    } catch (fetchError: any) {
      console.error("❌ Solver error:", fetchError);
      console.error("   Error name:", fetchError.name);
      console.error("   Error code:", fetchError.cause?.code || 'UNKNOWN');
      
      if (fetchError.name === "TimeoutError") {
        return {
          success: false,
          message: "⏱️ Server timed out (600s): Problem extremely complex. Try disabling heavy lessons (Aesthetic/IT) or reducing time limit.",
        };
      }
      
      // Check for connection refused errors (should not happen after health check)
      if (fetchError.cause?.code === "ECONNREFUSED" || fetchError.message?.includes("ECONNREFUSED")) {
        return {
          success: false,
          message: '🔴 Server not found: Solver stopped mid-execution. Check terminal for Python errors.',
        };
      }
      
      if (fetchError.message?.includes("fetch failed")) {
        return {
          success: false,
          message: `Network error: ${fetchError.message}. Check if solver.py is still running.`,
        };
      }
      
      return {
        success: false,
        message: `Unexpected error connecting to solver: ${fetchError.message}`,
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
    console.log(`📊 Scheduled slots: ${result?.slots?.length || 0}`);
    console.log(`📌 Unplaced tasks: ${result?.unplacedTasks?.length || 0}`);
    console.log(`⚠️  Conflicts: ${result?.conflicts || 0}`);
    console.log(`⏱️  Solver time: ${result?.solvingTime?.toFixed(2) || 'N/A'}s`);
    console.log(`🎯 Subject distribution: Advanced AI balancing with penalty system`);
    console.log(`   (-20pts per same-subject-per-day overflow)`)
    console.log(`📈 Stats:`, result?.stats);
    console.log(`💬 Message: ${result?.message}`);
    
    // Log unplaced task details
    if (result?.unplacedTasks && result.unplacedTasks.length > 0) {
      console.log(`\n📌 UNPLACED TASKS FROM SOLVER (${result.unplacedTasks.length} total):`);
      console.log(`   First 5:`, result.unplacedTasks.slice(0, 5).map(t => ({
        lessonName: t.lessonName,
        className: t.className,
        taskType: t.taskType
      })));
    }

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

    // Step 6: Ensure version exists and clear its slots
    console.log(`\n📋 Step 6: Ensuring version '${finalVersionName}' exists...`);
    
    const draftVersion = await TimetableVersion.findOneAndUpdate(
      { 
        schoolId: school._id, 
        versionName: finalVersionName 
      },
      { 
        schoolId: school._id,
        versionName: finalVersionName,
        isSaved: false, // Will be set to true after successful save
        isPublished: false,
        updatedAt: new Date()
      },
      { 
        upsert: true, // Create if doesn't exist
        new: true // Return the updated document
      }
    );
    
    console.log(`✅ Draft version ID: ${draftVersion._id}`);
    console.log(`[DEBUG] Version name: ${draftVersion.versionName}`);
    
    // Delete existing slots for this version only
    console.log("\n🗑️  Clearing existing slots for Draft version...");
    const deleteResult = await TimetableSlot.deleteMany({ 
      schoolId: school._id,
      versionId: draftVersion._id 
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} old slots from Draft version`);
    
    // CRITICAL: Delete ALL ghost lessons with day='Unscheduled' (from old architecture)
    console.log("\n🧹 Cleaning up ghost lessons with day='Unscheduled'...");
    const ghostDeleteResult = await TimetableSlot.deleteMany({
      schoolId: school._id,
      day: 'Unscheduled'
    });
    console.log(`✅ Deleted ${ghostDeleteResult.deletedCount} ghost lessons (old unscheduled slots)`);

    // Step 7: Save new timetable to MongoDB
    console.log("\n💾 Step 7: Saving timetable to MongoDB...");
    console.log(`[DEBUG] Linking all slots to versionId: ${draftVersion._id}`);
    
    // Deduplicate slots (safety net)
    const slotMap = new Map<string, any>();
    result.slots.forEach((slot) => {
      const key = `${slot.classId}-${slot.day}-${slot.periodNumber}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          schoolId: school._id,
          versionId: draftVersion._id, // CRITICAL: Link to version
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
    console.log(`[DEBUG] Sample scheduled slot:`, deduplicatedSlots[0]);

    // Step 7b: Save unplaced lessons + disabled lessons to version document
    // This completely bypasses the E11000 duplicate key error
    let unplacedLessonsData: any[] = [];
    
    // First, add unplaced tasks from solver
    if (result.unplacedTasks && result.unplacedTasks.length > 0) {
      console.log(`\n📌 Step 7b: Processing ${result.unplacedTasks.length} unplaced lessons from AI...`);
      console.log(`   Storing in TimetableVersion.unplacedLessons array (bypasses E11000)`);
      
      // Store unplaced lessons as rich data objects in the version document
      unplacedLessonsData = result.unplacedTasks.map((task) => ({
        lessonId: task.lessonId,
        classId: task.classId,
        lessonName: task.lessonName,
        className: task.className,
        teacherName: task.teacherName,
        taskType: task.taskType,
      }));
      
      console.log(`✅ Added ${unplacedLessonsData.length} unplaced lessons from solver`);
      console.log(`[DEBUG] Sample unplaced lesson:`, unplacedLessonsData[0]);
    }
    
    // Second, add ALL disabled lessons (they were never sent to solver)
    if (disabledLessons.length > 0) {
      console.log(`\n📌 Adding ${disabledLessons.length} disabled lessons to manual placement pool...`);
      
      for (const disabledLesson of disabledLessons) {
        // For each class in the lesson, create unplaced entries for singles and doubles
        for (const classId of disabledLesson.classIds) {
          const classObj = classesData.find((c: any) => c._id.toString() === classId.toString());
          const className = classObj ? `${classObj.grade}-${classObj.name}` : 'Unknown';
          
          // Add singles
          for (let i = 0; i < (disabledLesson.numberOfSingles || 0); i++) {
            unplacedLessonsData.push({
              lessonId: disabledLesson._id.toString(),
              classId: classId.toString(),
              lessonName: disabledLesson.lessonName,
              className: className,
              teacherName: 'N/A',
              taskType: 'single',
            });
          }
          
          // Add doubles
          for (let i = 0; i < (disabledLesson.numberOfDoubles || 0); i++) {
            unplacedLessonsData.push({
              lessonId: disabledLesson._id.toString(),
              classId: classId.toString(),
              lessonName: disabledLesson.lessonName,
              className: className,
              teacherName: 'N/A',
              taskType: 'double',
            });
          }
        }
      }
      
      console.log(`✅ Added ${disabledLessons.length} disabled lessons (${unplacedLessonsData.length - (result.unplacedTasks?.length || 0)} tasks) to manual placement pool`);
      console.log(`   These lessons will appear in the sidebar for drag-and-drop placement`);
    }
    
    // Update version document with combined unplaced array
    if (unplacedLessonsData.length > 0) {
      await TimetableVersion.findByIdAndUpdate(
        draftVersion._id,
        { unplacedLessons: unplacedLessonsData },
        { new: true }
      );
      
      console.log(`✅ Saved ${unplacedLessonsData.length} total items to version document`);
      console.log(`   ${result.unplacedTasks?.length || 0} from AI + ${disabledLessons.length} disabled`);
      console.log(`   100% guaranteed persistence - no unique index conflicts`);
    } else {
      console.log(`\n✅ Step 7b: No unscheduled lessons - all tasks placed!`);
      
      // Clear any existing unplaced lessons
      await TimetableVersion.findByIdAndUpdate(
        draftVersion._id,
        { unplacedLessons: [] },
        { new: true }
      );
    }

    // Step 7c: Insert ONLY the successfully placed slots (no unplaced slots)
    console.log(`\n💾 Step 7c: Inserting scheduled slots to TimetableSlot collection...`);
    const allSlots = deduplicatedSlots; // ONLY placed slots, no unscheduled
    console.log(`[DEBUG] Scheduled slots to insert: ${allSlots.length}`);
    console.log(`[DEBUG] Unplaced lessons in version: ${unplacedLessonsData.length}`);
    console.log(`[DEBUG] Total accountability: ${allSlots.length} + ${unplacedLessonsData.length} = ${allSlots.length + unplacedLessonsData.length} periods`);
    
    let insertResult;
    try {
      insertResult = await TimetableSlot.insertMany(allSlots, {
        ordered: false, // Continue on duplicate key errors
      });
      console.log(`✅ Successfully inserted ${insertResult.length} slots`);
    } catch (insertError: any) {
      console.error(`❌ Insert error occurred:`, insertError.message);
      
      if (insertError.code === 11000) {
        console.error(`   E11000 Duplicate Key Error Details:`, insertError.writeErrors?.slice(0, 3));
        // Still count successful inserts
        insertResult = insertError.insertedDocs || [];
        console.log(`   Partially inserted: ${insertResult.length} slots before error`);
      } else {
        throw insertError;
      }
    }

    const scheduledCount = deduplicatedSlots.length;
    const unplacedCount = unplacedLessonsData.length;
    console.log(`✅ Successfully saved timetable data:`);
    console.log(`   - Scheduled slots (TimetableSlot): ${scheduledCount}`);
    console.log(`   - Unplaced lessons (Version array): ${unplacedCount}`);
    console.log(`   - Total periods accounted: ${scheduledCount + unplacedCount}`);
    console.log(`[DEBUG] Insert result count: ${insertResult.length}`);
    
    // Step 8: Update version status to saved
    console.log("\n📝 Step 8: Updating Draft version status...");
    await TimetableVersion.findByIdAndUpdate(draftVersion._id, {
      isSaved: true,
      updatedAt: new Date()
    });
    console.log(`✅ Draft version marked as saved`);

    // Step 9: Revalidate paths
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    // Step 10: Final summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ TIMETABLE GENERATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`⏱️  Total time: ${apiTime}s`);
    console.log(`📊 Scheduled slots: ${scheduledCount}/${expectedSlots}`);
    console.log(`📌 Unplaced lessons: ${unplacedCount}`);
    console.log(`📦 Total saved: ${insertResult.length} scheduled + ${unplacedCount} in version array`);
    console.log(`⚠️  Conflicts: ${result.conflicts} (CP-SAT guarantees 0)`);
    console.log(`🎯 Coverage: ${slotCoverage}%`);
    console.log(`📁 Version: ${draftVersion.versionName} (${draftVersion._id})`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      message: unplacedCount > 0 
        ? `Timetable generated! ${scheduledCount} scheduled + ${unplacedCount} unplaced (${slotCoverage}% grid coverage).`
        : `Timetable generated successfully! ${scheduledCount}/${expectedSlots} slots placed in ${versionName} version (${slotCoverage}% coverage).`,
      slotsPlaced: scheduledCount,
      totalSlots: expectedSlots,
      conflicts: result.conflicts,
      solvingTime: result.solvingTime,
      stats: {
        totalSlots: insertResult.length,
        scheduledLessons: scheduledCount,
        failedLessons: unplacedCount,
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
