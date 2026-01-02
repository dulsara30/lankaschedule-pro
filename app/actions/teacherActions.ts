'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import Teacher from '@/models/Teacher';
import Lesson from '@/models/Lesson';
import TimetableSlot from '@/models/TimetableSlot';
import mongoose from 'mongoose';

interface DeleteResult {
  success: boolean;
  message?: string;
  error?: string;
  lessonsUpdated?: number;
}

interface LessonWithSlots {
  _id: string;
  lessonName: string;
  subjectIds: Array<{ _id: string; name: string }>;
  classIds: Array<{ _id: string; name: string }>;
  slots: Array<{
    _id: string;
    day: string;
    periodNumber: number;
  }>;
}

interface ConflictCheck {
  hasConflict: boolean;
  conflictingSlots: Array<{
    day: string;
    periodNumber: number;
  }>;
  currentWorkload: number;
  newWorkload: number;
  isOverCapacity: boolean;
}

/**
 * Smart Teacher Deletion with Lesson Reassignment
 * 
 * This function handles the deletion of a teacher by:
 * 1. Finding all lessons associated with the teacher
 * 2. Reassigning those lessons to a replacement teacher (or removing the teacher if no replacement)
 * 3. Deleting the teacher from the database
 * 4. Revalidating relevant pages
 * 
 * @param teacherToDeleteId - The ID of the teacher to delete
 * @param replacementTeacherId - Optional ID of the replacement teacher
 * @returns DeleteResult with success status and details
 */
export async function deleteAndReassignTeacher(
  teacherToDeleteId: string,
  replacementTeacherId?: string
): Promise<DeleteResult> {
  try {
    await dbConnect();

    // Validate teacher IDs
    if (!mongoose.Types.ObjectId.isValid(teacherToDeleteId)) {
      return { success: false, error: 'Invalid teacher ID' };
    }

    if (replacementTeacherId && !mongoose.Types.ObjectId.isValid(replacementTeacherId)) {
      return { success: false, error: 'Invalid replacement teacher ID' };
    }

    // Check if teacher exists
    const teacherToDelete = await Teacher.findById(teacherToDeleteId);
    if (!teacherToDelete) {
      return { success: false, error: 'Teacher not found' };
    }

    // If replacement teacher is provided, verify they exist
    if (replacementTeacherId) {
      const replacementTeacher = await Teacher.findById(replacementTeacherId);
      if (!replacementTeacher) {
        return { success: false, error: 'Replacement teacher not found' };
      }
    }

    // Step A: Find all lessons where this teacher is assigned
    const teacherObjectId = new mongoose.Types.ObjectId(teacherToDeleteId);
    const affectedLessons = await Lesson.find({
      teacherIds: teacherObjectId
    });

    let lessonsUpdated = 0;

    // Step B: Update lessons - either reassign or remove the teacher
    if (affectedLessons.length > 0) {
      for (const lesson of affectedLessons) {
        // Remove the teacher being deleted
        lesson.teacherIds = lesson.teacherIds.filter(
          (id: mongoose.Types.ObjectId) => id.toString() !== teacherToDeleteId
        );

        // If replacement teacher is provided, add them (avoiding duplicates)
        if (replacementTeacherId) {
          const replacementObjectId = new mongoose.Types.ObjectId(replacementTeacherId);
          const alreadyAssigned = lesson.teacherIds.some(
            (id: mongoose.Types.ObjectId) => id.toString() === replacementTeacherId
          );

          if (!alreadyAssigned) {
            lesson.teacherIds.push(replacementObjectId);
          }
        }

        await lesson.save();
        lessonsUpdated++;
      }
    }

    // Step C: Delete the teacher
    await Teacher.findByIdAndDelete(teacherToDeleteId);

    // Revalidate relevant pages
    revalidatePath('/dashboard/teachers');
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    const message = replacementTeacherId
      ? `Teacher deleted successfully. ${lessonsUpdated} lesson(s) reassigned to new teacher.`
      : `Teacher deleted successfully. Removed from ${lessonsUpdated} lesson(s).`;

    return {
      success: true,
      message,
      lessonsUpdated
    };

  } catch (error) {
    console.error('Error in deleteAndReassignTeacher:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete teacher'
    };
  }
}

/**
 * Get lesson count for a teacher
 * Used to show how many lessons will be affected before deletion
 */
export async function getTeacherLessonCount(teacherId: string): Promise<number> {
  try {
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return 0;
    }

    const count = await Lesson.countDocuments({
      teacherIds: new mongoose.Types.ObjectId(teacherId)
    });

    return count;
  } catch (error) {
    console.error('Error getting teacher lesson count:', error);
    return 0;
  }
}

/**
 * Get all lessons with their timetable slots for a teacher
 * Used for intelligent reassignment UI
 */
export async function getTeacherLessonsWithSlots(
  teacherId: string,
  versionId?: string
): Promise<LessonWithSlots[]> {
  try {
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return [];
    }

    const teacherObjectId = new mongoose.Types.ObjectId(teacherId);

    // Find all lessons assigned to this teacher
    const lessons = await Lesson.find({
      teacherIds: teacherObjectId
    })
      .populate('subjectIds', 'name')
      .populate('classIds', 'name')
      .lean();

    // For each lesson, find its timetable slots
    const lessonsWithSlots: LessonWithSlots[] = [];

    for (const lesson of lessons) {
      const query: any = {
        lessonId: lesson._id
      };

      // If versionId is provided, filter by version
      if (versionId && mongoose.Types.ObjectId.isValid(versionId)) {
        query.versionId = new mongoose.Types.ObjectId(versionId);
      }

      const slots = await TimetableSlot.find(query)
        .select('day periodNumber')
        .lean();

      lessonsWithSlots.push({
        _id: lesson._id.toString(),
        lessonName: lesson.lessonName,
        subjectIds: lesson.subjectIds.map((s: any) => ({
          _id: s._id.toString(),
          name: s.name
        })),
        classIds: lesson.classIds.map((c: any) => ({
          _id: c._id.toString(),
          name: c.name
        })),
        slots: slots.map(slot => ({
          _id: slot._id.toString(),
          day: slot.day,
          periodNumber: slot.periodNumber
        }))
      });
    }

    return lessonsWithSlots;
  } catch (error) {
    console.error('Error getting teacher lessons with slots:', error);
    return [];
  }
}

/**
 * Check for conflicts when reassigning a lesson to a new teacher
 * Returns conflict information and workload analysis
 */
export async function checkReassignmentConflicts(
  replacementTeacherId: string,
  lessonSlots: Array<{ day: string; periodNumber: number }>,
  versionId?: string
): Promise<ConflictCheck> {
  try {
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(replacementTeacherId)) {
      return {
        hasConflict: false,
        conflictingSlots: [],
        currentWorkload: 0,
        newWorkload: 0,
        isOverCapacity: false
      };
    }

    const teacherObjectId = new mongoose.Types.ObjectId(replacementTeacherId);

    // Get the teacher document to check max workload
    const teacher = await Teacher.findById(teacherObjectId).lean();
    const maxWorkload = 35; // Default max periods per week

    // Build query for existing slots
    const query: any = {
      'lessonId.teacherIds': teacherObjectId
    };

    if (versionId && mongoose.Types.ObjectId.isValid(versionId)) {
      query.versionId = new mongoose.Types.ObjectId(versionId);
    }

    // Get all existing slots for this teacher
    const existingSlots = await TimetableSlot.find(query)
      .populate({
        path: 'lessonId',
        select: 'teacherIds'
      })
      .select('day periodNumber')
      .lean();

    // Calculate current workload
    const currentWorkload = existingSlots.length;
    const newWorkload = currentWorkload + lessonSlots.length;
    const isOverCapacity = newWorkload > maxWorkload;

    // Check for conflicts (same day and period)
    const conflictingSlots: Array<{ day: string; periodNumber: number }> = [];

    for (const newSlot of lessonSlots) {
      const hasConflict = existingSlots.some(
        existing =>
          existing.day === newSlot.day &&
          existing.periodNumber === newSlot.periodNumber
      );

      if (hasConflict) {
        conflictingSlots.push({
          day: newSlot.day,
          periodNumber: newSlot.periodNumber
        });
      }
    }

    return {
      hasConflict: conflictingSlots.length > 0,
      conflictingSlots,
      currentWorkload,
      newWorkload,
      isOverCapacity
    };
  } catch (error) {
    console.error('Error checking reassignment conflicts:', error);
    return {
      hasConflict: false,
      conflictingSlots: [],
      currentWorkload: 0,
      newWorkload: 0,
      isOverCapacity: false
    };
  }
}

/**
 * Delete teacher with individual lesson reassignments
 * Supports per-lesson replacement teacher selection
 */
export async function deleteWithMultipleReassignments(
  teacherToDeleteId: string,
  lessonReassignments: Array<{
    lessonId: string;
    replacementTeacherId: string | null;
  }>
): Promise<DeleteResult> {
  try {
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(teacherToDeleteId)) {
      return { success: false, error: 'Invalid teacher ID' };
    }

    const teacherToDelete = await Teacher.findById(teacherToDeleteId);
    if (!teacherToDelete) {
      return { success: false, error: 'Teacher not found' };
    }

    let lessonsUpdated = 0;

    // Process each lesson reassignment
    for (const reassignment of lessonReassignments) {
      if (!mongoose.Types.ObjectId.isValid(reassignment.lessonId)) {
        continue;
      }

      const lesson = await Lesson.findById(reassignment.lessonId);
      if (!lesson) continue;

      // Remove the teacher being deleted
      lesson.teacherIds = lesson.teacherIds.filter(
        (id: mongoose.Types.ObjectId) => id.toString() !== teacherToDeleteId
      );

      // Add replacement teacher if provided
      if (reassignment.replacementTeacherId) {
        if (!mongoose.Types.ObjectId.isValid(reassignment.replacementTeacherId)) {
          continue;
        }

        const replacementObjectId = new mongoose.Types.ObjectId(
          reassignment.replacementTeacherId
        );

        const alreadyAssigned = lesson.teacherIds.some(
          (id: mongoose.Types.ObjectId) =>
            id.toString() === reassignment.replacementTeacherId
        );

        if (!alreadyAssigned) {
          lesson.teacherIds.push(replacementObjectId);
        }
      }

      await lesson.save();
      lessonsUpdated++;
    }

    // Delete the teacher
    await Teacher.findByIdAndDelete(teacherToDeleteId);

    // Revalidate pages
    revalidatePath('/dashboard/teachers');
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    return {
      success: true,
      message: `Teacher deleted successfully. ${lessonsUpdated} lesson(s) updated.`,
      lessonsUpdated
    };
  } catch (error) {
    console.error('Error in deleteWithMultipleReassignments:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete teacher'
    };
  }
}
