'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import Teacher from '@/models/Teacher';
import Lesson from '@/models/Lesson';
import mongoose from 'mongoose';

interface DeleteResult {
  success: boolean;
  message?: string;
  error?: string;
  lessonsUpdated?: number;
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
