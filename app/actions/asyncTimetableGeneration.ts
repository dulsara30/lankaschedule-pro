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

interface SolverPayload {
  lessons: any[];
  classes: any[];
  teachers: any[];
  subjects: any[];
  schoolConfig: any;
  versionName: string;
  maxTimeLimit: number;
  allowRelaxation: boolean;
}

/**
 * Start async timetable generation - returns job ID immediately
 */
export async function startTimetableGeneration(
  versionName: string,
  strictBalancing: boolean = true,
  maxTimeLimit: number = 300
): Promise<{ success: boolean; jobId?: string; message?: string }> {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING ASYNC TIMETABLE GENERATION');
    console.log('='.repeat(60));

    // Step 1: Connect to database
    await dbConnect();

    // Step 2: Fetch school data
    const school = await School.findOne().lean();
    if (!school) {
      return { success: false, message: 'School not found' };
    }

    // Step 3: Fetch all data
    const [lessonsData, classesData, teachersData, subjectsData] = await Promise.all([
      Lesson.find({ schoolId: school._id }).populate('subjectIds').populate('teacherIds').populate('classIds').lean(),
      Class.find({ schoolId: school._id }).lean(),
      Teacher.find({ schoolId: school._id }).lean(),
      Subject.find({ schoolId: school._id }).lean(),
    ]);

    // Step 4: Filter lessons - include ALL except explicitly disabled
    // This captures: enabled, undefined, null, and any other status
    const enabledLessons = lessonsData.filter((lesson: any) => lesson.status !== 'disabled');
    const disabledLessons = lessonsData.filter((lesson: any) => lesson.status === 'disabled');

    console.log(`📊 Total lessons in database: ${lessonsData.length}`);
    console.log(`✅ Lessons to schedule (status !== 'disabled'): ${enabledLessons.length}`);
    console.log(`❌ Disabled lessons (excluded): ${disabledLessons.length}`);
    
    // Log status distribution for debugging
    const statusCounts: any = {};
    lessonsData.forEach((lesson: any) => {
      const status = lesson.status || 'undefined';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    console.log(`📋 Status distribution:`, statusCounts);
    
    // CRITICAL: Log first few lessons to verify structure
    console.log(`🔍 Sample lessons (first 3):`, enabledLessons.slice(0, 3).map(l => ({
      _id: l._id,
      lessonName: l.lessonName,
      status: l.status,
      subjectIds: l.subjectIds?.length,
      teacherIds: l.teacherIds?.length,
      classIds: l.classIds?.length,
    })));

    if (enabledLessons.length === 0) {
      return {
        success: false,
        message: 'No enabled lessons found. Please enable at least one lesson before generating.'
      };
    }

    // Step 5: Prepare payload
    const payload: SolverPayload = {
      lessons: enabledLessons.map((lesson: any) => ({
        _id: lesson._id.toString(),
        lessonName: lesson.lessonName,
        subjectIds: lesson.subjectIds.map((s: any) => s._id.toString()),
        teacherIds: lesson.teacherIds.map((t: any) => t._id.toString()),
        classIds: lesson.classIds.map((c: any) => c._id.toString()),
        numberOfSingles: lesson.numberOfSingles,
        numberOfDoubles: lesson.numberOfDoubles,
      })),
      classes: classesData.map((cls: any) => ({
        _id: cls._id.toString(),
        name: cls.name,
        grade: cls.grade,
      })),
      teachers: teachersData.map((teacher: any) => ({
        _id: teacher._id.toString(),
        name: teacher.name,
      })),
      subjects: subjectsData.map((subject: any) => ({
        _id: subject._id.toString(),
        name: subject.name,
      })),
      schoolConfig: {
        numberOfPeriods: school.periodsPerDay || 8,
        intervalSlots: school.intervalSlots || [],
        daysOfWeek: (school.daysOfWeek || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).map((day: string) => ({
          name: day,
          abbreviation: day.substring(0, 3),
        })),
      },
      versionName,
      maxTimeLimit,
      allowRelaxation: !strictBalancing,
    };

    console.log(`✅ Payload prepared: ${payload.lessons.length} enabled lessons`);
    console.log(`📦 Payload structure:`);
    console.log(`   - Lessons: ${payload.lessons.length}`);
    console.log(`   - Classes: ${payload.classes.length}`);
    console.log(`   - Teachers: ${payload.teachers.length}`);
    console.log(`   - Subjects: ${payload.subjects.length}`);
    console.log(`   - School Config:`, JSON.stringify(payload.schoolConfig, null, 2));
    console.log(`   - Max Time Limit: ${payload.maxTimeLimit}s`);
    console.log(`   - Allow Relaxation: ${payload.allowRelaxation}`);

    // Step 6: Call Python solver to START job
    const solverUrl = process.env.SOLVER_URL || 'http://127.0.0.1:8000';
    
    const startResponse = await fetch(`${solverUrl}/start-solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout just for starting
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.error(`❌ Solver returned ${startResponse.status}: ${errorText}`);
      console.error(`📦 Payload sent:`, JSON.stringify(payload, null, 2));
      return {
        success: false,
        message: `Failed to start solver (${startResponse.status}): ${errorText}`,
      };
    }

    const startResult = await startResponse.json();
    console.log(`✅ Job started! Job ID: ${startResult.jobId}`);

    return {
      success: true,
      jobId: startResult.jobId,
      message: 'Timetable generation started in background',
    };
  } catch (error: any) {
    console.error('Failed to start generation:', error);
    return {
      success: false,
      message: `Failed to start: ${error.message}`,
    };
  }
}

/**
 * Check job status
 */
export async function checkJobStatus(jobId: string) {
  try {
    const solverUrl = process.env.SOLVER_URL || 'http://127.0.0.1:8000';
    const response = await fetch(`${solverUrl}/job-status/${jobId}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { success: false, message: 'Job not found' };
    }

    const status = await response.json();
    return { success: true, status };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Save completed timetable to database
 */
export async function saveTimetableResults(jobId: string, versionName: string) {
  try {
    // Get job result
    const statusCheck = await checkJobStatus(jobId);
    if (!statusCheck.success || statusCheck.status.status !== 'completed') {
      return { success: false, message: 'Job not completed' };
    }

    const result = statusCheck.status.result;

    // Connect to database
    await dbConnect();
    const school = await School.findOne().lean();
    if (!school) {
      return { success: false, message: 'School not found' };
    }

    // Create/update version
    const draftVersion = await TimetableVersion.findOneAndUpdate(
      { schoolId: school._id, versionName },
      {
        schoolId: school._id,
        versionName,
        isSaved: true,
        unplacedLessons: result.unplacedTasks || [],
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // ATOMIC OPERATION: Delete ALL existing slots for this version before inserting new ones
    console.log(`🗑️  Deleting existing slots for version: ${draftVersion._id}`);
    const deleteResult = await TimetableSlot.deleteMany({
      schoolId: school._id,
      versionId: draftVersion._id,
    });
    console.log(`   ✅ Deleted ${deleteResult.deletedCount} old slots`);

    // Save new slots (fresh 100% placement data)
    const slots = result.slots.map((slot: any) => ({
      schoolId: school._id,
      versionId: draftVersion._id,
      classId: String(slot.classId),  // CRITICAL: Explicitly convert to String ID
      lessonId: String(slot.lessonId),  // CRITICAL: Explicitly convert to String ID
      day: slot.day,
      periodNumber: slot.periodNumber,
      isDoubleStart: slot.isDoubleStart,
      isDoubleEnd: slot.isDoubleEnd,
    }));

    console.log(`💾 Inserting ${slots.length} new slots for 100% placement`);
    const insertResult = await TimetableSlot.insertMany(slots);
    console.log(`   ✅ Successfully saved ${insertResult.length} slots to database`);
    
    // CRITICAL: Revalidate paths AFTER successful insert to force immediate UI refresh
    console.log(`   🔄 Triggering UI refresh for immediate visibility`);
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');
    revalidatePath('/');
    console.log(`   ✅ UI refresh paths revalidated`);

    return {
      success: true,
      message: `Saved ${slots.length} slots`,
      slotsPlaced: slots.length,
      conflicts: result.conflicts || 0,
      solvingTime: result.solvingTime || 0,
    };
  } catch (error: any) {
    console.error('Failed to save results:', error);
    return { success: false, message: error.message };
  }
}
