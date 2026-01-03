'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import School from '@/models/School';
import Subject from '@/models/Subject';
import Teacher from '@/models/Teacher';
import Lesson from '@/models/Lesson';
import Class from '@/models/Class';
import TimetableSlot from '@/models/TimetableSlot';
import TimetableVersion from '@/models/TimetableVersion';
import { generateTimetable, ScheduleLesson, ScheduleClass, ConflictDiagnostic } from '@/lib/algorithm/minConflictsScheduler';

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
  failedLessons?: ConflictDiagnostic[];
  currentStep?: number;
  totalSteps?: number;
}

export async function generateTimetableAction(): Promise<GenerateTimetableResult> {
  try {
    await dbConnect();

    // Force model registration to prevent MissingSchemaError
    [Subject, Teacher, Class, Lesson, School, TimetableSlot, TimetableVersion].forEach(m => m?.modelName);

    // Step 1: Fetch school configuration
    const school = await School.findOne();
    if (!school) {
      return {
        success: false,
        message: 'School configuration not found. Please complete school setup first.',
      };
    }

    const config = school.config;
    
    // Extract interval slot positions dynamically from school config
    const intervalSlots = config.intervalSlots.map((slot: { afterPeriod: number }) => slot.afterPeriod);

    // 2. Fetch all lessons
    const lessonsData = await Lesson.find({ schoolId: school._id })
      .populate('subjectIds')
      .populate('teacherIds')
      .populate('classIds')
      .lean();

    if (!lessonsData || lessonsData.length === 0) {
      return {
        success: false,
        message: 'No lessons found. Please create lessons before generating timetable.',
      };
    }

    // 3. Fetch all classes
    const classesData = await Class.find({ schoolId: school._id }).lean();

    if (!classesData || classesData.length === 0) {
      return {
        success: false,
        message: 'No classes found. Please create classes before generating timetable.',
      };
    }

    // 4. Transform data for algorithm
    interface LessonData {
      _id: { toString: () => string };
      lessonName: string;
      subjectIds: Array<{ _id: { toString: () => string } }>;
      teacherIds: Array<{ _id: { toString: () => string } }>;
      classIds: Array<{ _id: { toString: () => string } }>;
      numberOfSingles?: number;
      numberOfDoubles?: number;
      color: string;
    }

    const lessons: ScheduleLesson[] = (lessonsData as LessonData[]).map((lesson) => ({
      _id: lesson._id.toString(),
      lessonName: lesson.lessonName,
      subjectIds: lesson.subjectIds.map((s) => s._id.toString()),
      teacherIds: lesson.teacherIds.map((t) => t._id.toString()),
      classIds: lesson.classIds.map((c) => c._id.toString()),
      numberOfSingles: lesson.numberOfSingles || 0,
      numberOfDoubles: lesson.numberOfDoubles || 0,
      color: lesson.color,
    }));

    interface ClassData {
      _id: { toString: () => string };
      name: string;
      grade: number;
    }

    const classes: ScheduleClass[] = (classesData as ClassData[]).map((cls) => ({
      _id: cls._id.toString(),
      name: cls.name,
      grade: cls.grade,
    }));

    const scheduleConfig = {
      numberOfPeriods: config.numberOfPeriods,
      intervalSlots,
      daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    };

    // 5. Run the AI algorithm
    const result = generateTimetable(lessons, classes, scheduleConfig);

    console.log('📊 Scheduler Results:');
    console.log(`   Total slots: ${result.slots.length}`);
    console.log(`   Scheduled lessons: ${result.stats.scheduledLessons}`);
    console.log(`   Failed lessons: ${result.failedLessons.length}`);
    console.log(`   Swap attempts: ${result.stats.swapAttempts}`);
    console.log(`   Successful swaps: ${result.stats.successfulSwaps}`);
    console.log(`   Iterations: ${result.stats.iterations}`);
    
    // Debug: Show sample slots with double period flags
    const sampleSlots = result.slots.slice(0, 5);
    console.log('📝 Sample slots from scheduler:');
    sampleSlots.forEach((slot, idx) => {
      console.log(`   ${idx + 1}. Day: ${slot.day}, Period: ${slot.periodNumber}, ` +
        `DoubleStart: ${slot.isDoubleStart}, DoubleEnd: ${slot.isDoubleEnd}`);
    });

    // 6. Handle versioning: ONLY delete draft version slots
    console.log('🔍 Checking for existing draft version...');
    
    // Find existing draft version (if any)
    const existingDraft = await TimetableVersion.findOne({
      schoolId: school._id,
      isSaved: false,
    });

    if (existingDraft) {
      console.log(`🗑️  Found existing draft version: ${existingDraft.versionName} (ID: ${existingDraft._id})`);
      
      // Delete ONLY slots belonging to this specific draft version
      const draftSlotsDeleted = await TimetableSlot.deleteMany({ 
        versionId: existingDraft._id 
      });
      console.log(`   Deleted ${draftSlotsDeleted.deletedCount} slots from draft version`);
      
      // Delete the draft version metadata itself
      await TimetableVersion.deleteOne({ _id: existingDraft._id });
      console.log('   Draft version deleted');
    } else {
      console.log('✅ No existing draft found. Saved versions are preserved.');
    }
    
    // Verify saved versions are intact
    const savedVersionCount = await TimetableVersion.countDocuments({
      schoolId: school._id,
      isSaved: true,
    });
    console.log(`📚 Saved versions protected: ${savedVersionCount} versions remain intact`);

    // 7. Create new draft version with conflict-aware naming
    console.log('📦 Creating new draft version...');
    
    // CRITICAL: Indicate if manual review is needed due to conflicts
    const hasConflicts = result.stats.conflictsRemaining && result.stats.conflictsRemaining > 0;
    const versionName = hasConflicts 
      ? `Version ${savedVersionCount + 1}.0 (Draft - Requires Review)` 
      : `Version ${savedVersionCount + 1}.0 (Draft)`;
    
    console.log(`   Version status: ${hasConflicts ? '⚠️ Has conflicts - Manual review required' : '✅ Conflict-free'}`);
    
    const newVersion = await TimetableVersion.create({
      schoolId: school._id,
      versionName,
      isSaved: false,
    });
    
    console.log(`✅ Created new version: ${newVersion.versionName} (ID: ${newVersion._id})`);

    // 8. CRITICAL: Save generated slots to database ALWAYS (best-effort approach)
    if (result.slots.length > 0) {
      console.log(`💾 BEST-EFFORT SAVE: Persisting ${result.slots.length} slots to database...`);
      
      // Explicitly cast versionId to mongoose.Types.ObjectId to ensure type compatibility
      const versionObjectId = new mongoose.Types.ObjectId(newVersion._id.toString());
      
      const slotsToSave = result.slots.map((slot) => ({
        schoolId: school._id,
        versionId: versionObjectId, // Explicitly cast to ObjectId
        classId: slot.classId,
        lessonId: slot.lessonId,
        day: slot.day,
        periodNumber: slot.periodNumber,
        isDoubleStart: slot.isDoubleStart || false,
        isDoubleEnd: slot.isDoubleEnd || false,
        isLocked: false,
      }));

      console.log(`   Total slots to save: ${slotsToSave.length}`);
      console.log(`   Version ID being used: ${newVersion._id}`);
      
      // Debug: Show what we're saving
      const doubleSlotsCount = slotsToSave.filter(s => s.isDoubleStart || s.isDoubleEnd).length;
      console.log(`   Double period slots: ${doubleSlotsCount}`);
      
      const insertedSlots = await TimetableSlot.insertMany(slotsToSave);
      
      console.log(`✅ BEST-EFFORT SAVE COMPLETE: Inserted ${insertedSlots.length} documents`);
      
      if (result.stats.conflictsRemaining && result.stats.conflictsRemaining > 0) {
        console.log(`⚠️ Saved ${insertedSlots.length} slots with ${result.stats.conflictsRemaining} conflicts for manual resolution`);
      }
      
      // Verify that versionId was saved
      const verifySlot = await TimetableSlot.findOne({ versionId: newVersion._id }).lean();
      console.log('🔍 Verification - Sample saved slot:', JSON.stringify(verifySlot, null, 2));
    } else {
      // Should NEVER happen with stochastic scheduler (Phase 1 greedy initialization places all tasks)
      console.error('❌ CRITICAL: No slots returned from scheduler!');
      return { 
        success: false, 
        message: 'Critical error: Scheduler failed to place any lessons. Please check lesson data and try again.' 
      };
    }

    // 9. Revalidate paths to update UI immediately
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');
    console.log('🔄 Paths revalidated - UI will update with new draft');

    // 10. Return result with full diagnostics (use conflictsRemaining for consistency)
    if (result.stats.conflictsRemaining && result.stats.conflictsRemaining > 0) {
      console.log(`✅ BEST-EFFORT SUCCESS: Draft saved with ${result.stats.conflictsRemaining} conflicts`);
      return {
        success: true, // SUCCESS: Draft saved (conflicts can be manually resolved)
        message: `✅ Timetable draft saved! ${result.stats.totalSlots} slots placed. ⚠️ ${result.stats.conflictsRemaining} conflicts detected - use Conflict Report to resolve manually.`,
        stats: result.stats,
        failedLessons: result.failedLessons,
      };
    }

    console.log(`🎉 PERFECT SUCCESS: Draft saved with zero conflicts`);
    return {
      success: true,
      message: `🎉 Timetable generated successfully! ${result.stats.totalSlots} slots placed with zero conflicts.`,
      stats: result.stats,
    };
  } catch (error: unknown) {
    console.error('Error generating timetable:', error);
    return {
      success: false,
      message: `Failed to generate timetable: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
