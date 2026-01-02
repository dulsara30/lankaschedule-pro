'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import School from '@/models/School';
import Lesson from '@/models/Lesson';
import Class from '@/models/Class';
import TimetableSlot from '@/models/TimetableSlot';
import TimetableVersion from '@/models/TimetableVersion';
import { generateTimetable, ScheduleLesson, ScheduleClass } from '@/lib/algorithm/scheduler';

export interface GenerateTimetableResult {
  success: boolean;
  message: string;
  stats?: {
    totalSlots: number;
    scheduledLessons: number;
    failedLessons: number;
    recursions: number;
  };
  failedLessons?: {
    lessonName: string;
    reason: string;
  }[];
  currentStep?: number;
  totalSteps?: number;
}

export async function generateTimetableAction(): Promise<GenerateTimetableResult> {
  try {
    await dbConnect();

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
    
    // Debug: Show sample slots with double period flags
    const sampleSlots = result.slots.slice(0, 5);
    console.log('📝 Sample slots from scheduler:');
    sampleSlots.forEach((slot, idx) => {
      console.log(`   ${idx + 1}. Day: ${slot.day}, Period: ${slot.periodNumber}, ` +
        `DoubleStart: ${slot.isDoubleStart}, DoubleEnd: ${slot.isDoubleEnd}`);
    });

    // 6. Handle versioning: Clean database state
    console.log('🔍 Cleaning existing slots and draft versions...');
    
    // Delete ALL existing slots for this school to ensure clean state
    const allSlotsDeleted = await TimetableSlot.deleteMany({ 
      schoolId: school._id
    });
    console.log(`🗑️  Deleted ALL ${allSlotsDeleted.deletedCount} existing slots for clean state`);
    
    // Delete existing draft version if any
    const existingDraft = await TimetableVersion.findOne({
      schoolId: school._id,
      isSaved: false,
    });

    if (existingDraft) {
      console.log(`🗑️  Found existing draft version: ${existingDraft.versionName}. Deleting...`);
      await TimetableVersion.deleteOne({ _id: existingDraft._id });
      console.log('   Draft version deleted');
    }

    // 7. Create new draft version
    console.log('📦 Creating new draft version...');
    
    // Calculate version name based on existing saved versions
    const existingVersions = await TimetableVersion.countDocuments({
      schoolId: school._id,
      isSaved: true,
    });
    
    const versionName = `Version ${existingVersions + 1}.0 (Draft)`;
    
    const newVersion = await TimetableVersion.create({
      schoolId: school._id,
      versionName,
      isSaved: false,
    });
    
    console.log(`✅ Created new version: ${newVersion.versionName} (ID: ${newVersion._id})`);

    // 8. Save generated slots to database with versionId
    if (result.slots.length > 0) {
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

      console.log('💾 Saving slots to database...');
      console.log(`   Total slots to save: ${slotsToSave.length}`);
      console.log(`   Version ID being used: ${newVersion._id}`);
      console.log(`   Sample slot with versionId:`, JSON.stringify(slotsToSave[0], null, 2));
      
      // Debug: Show what we're saving
      const doubleSlotsCount = slotsToSave.filter(s => s.isDoubleStart || s.isDoubleEnd).length;
      console.log(`   Double period slots: ${doubleSlotsCount}`);
      
      const insertedSlots = await TimetableSlot.insertMany(slotsToSave);
      
      console.log(`✅ Slots saved successfully! Inserted ${insertedSlots.length} documents`);
      
      // Verify that versionId was saved
      const verifySlot = await TimetableSlot.findOne({ versionId: newVersion._id }).lean();
      console.log('🔍 Verification - Sample saved slot:', JSON.stringify(verifySlot, null, 2));
    }

    // 9. Revalidate paths
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    // 10. Return result
    if (result.failedLessons.length > 0) {
      return {
        success: true,
        message: `Timetable generated with ${result.failedLessons.length} lesson(s) that could not be scheduled.`,
        stats: result.stats,
        failedLessons: result.failedLessons.map((f) => ({
          lessonName: f.lesson.lessonName,
          reason: f.reason,
        })),
      };
    }

    return {
      success: true,
      message: `Timetable generated successfully! Scheduled ${result.stats.scheduledLessons} lessons across ${result.stats.totalSlots} slots.`,
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
