'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import School from '@/models/School';
import Lesson from '@/models/Lesson';
import Class from '@/models/Class';
import TimetableSlot from '@/models/TimetableSlot';
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

    // 6. Clear existing timetable slots
    await TimetableSlot.deleteMany({ schoolId: school._id });

    // 7. Save generated slots to database
    if (result.slots.length > 0) {
      const slotsToSave = result.slots.map((slot) => ({
        schoolId: school._id,
        classId: slot.classId,
        lessonId: slot.lessonId,
        day: slot.day,
        periodNumber: slot.periodNumber,
        isLocked: false,
      }));

      await TimetableSlot.insertMany(slotsToSave);
    }

    // 8. Revalidate paths
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    // 9. Return result
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
