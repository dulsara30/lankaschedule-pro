'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';
import TimetableVersion from '@/models/TimetableVersion';
import School from '@/models/School';

interface MoveLessonParams {
  versionId: string;
  lessonId: string;
  classId: string;
  day: number;
  periodNumber: number;
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
}

export async function moveLessonToScheduled({
  versionId,
  lessonId,
  classId,
  day,
  periodNumber,
  isDoubleStart = false,
  isDoubleEnd = false,
}: MoveLessonParams) {
  try {
    await dbConnect();

    const school = await School.findOne();
    if (!school) {
      return { success: false, error: 'School not configured' };
    }

    // Step 1: Get the version document
    const version = await TimetableVersion.findById(versionId);
    if (!version) {
      return { success: false, error: 'Version not found' };
    }

    // Step 2: Find and remove the lesson from unplacedLessons array
    const unplacedLessons = version.unplacedLessons || [];
    const lessonIndex = unplacedLessons.findIndex(
      (item: any) => item.lessonId === lessonId && item.classId === classId
    );

    if (lessonIndex === -1) {
      return { success: false, error: 'Lesson not found in unplaced list' };
    }

    // Remove the lesson from the array
    unplacedLessons.splice(lessonIndex, 1);

    // Step 3: Update the version document
    await TimetableVersion.findByIdAndUpdate(versionId, {
      unplacedLessons,
      updatedAt: new Date(),
    });

    // Step 4: Create a new TimetableSlot
    const newSlot = await TimetableSlot.create({
      schoolId: school._id,
      versionId,
      classId,
      lessonId,
      day,
      periodNumber,
      isDoubleStart,
      isDoubleEnd,
    });

    console.log('✅ Moved lesson from unplaced to scheduled:', {
      lessonId,
      classId,
      day,
      periodNumber,
      slotId: newSlot._id,
    });

    // Revalidate pages
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    return {
      success: true,
      message: 'Lesson scheduled successfully',
      slotId: newSlot._id.toString(),
      remainingUnplaced: unplacedLessons.length,
    };
  } catch (error: any) {
    console.error('Error moving lesson to scheduled:', error);
    return {
      success: false,
      error: error.message || 'Failed to schedule lesson',
    };
  }
}
