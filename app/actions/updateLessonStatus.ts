'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import Lesson from '@/models/Lesson';

/**
 * Update Lesson Status (Enable/Disable)
 * 
 * Strategic utilization management:
 * - Enabled lessons: Sent to AI solver for automatic placement
 * - Disabled lessons: Sent directly to unplaced sidebar for manual placement
 * 
 * This allows schools to:
 * 1. Reduce AI workload by disabling complex lessons
 * 2. Ensure 100% conflict-free base grid
 * 3. Manually place challenging lessons after AI completes
 */
export async function updateLessonStatus(
  lessonId: string,
  status: 'enabled' | 'disabled'
) {
  try {
    await dbConnect();

    // Update lesson status
    const updatedLesson = await Lesson.findByIdAndUpdate(
      lessonId,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedLesson) {
      return {
        success: false,
        error: 'Lesson not found',
      };
    }

    // Revalidate pages that display lessons
    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/timetable');

    return {
      success: true,
      lesson: JSON.parse(JSON.stringify(updatedLesson)),
    };
  } catch (error: any) {
    console.error('❌ Error updating lesson status:', error);
    return {
      success: false,
      error: error.message || 'Failed to update lesson status',
    };
  }
}
