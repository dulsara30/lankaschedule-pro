'use server';

import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';
import Lesson from '@/models/Lesson';
import mongoose from 'mongoose';

interface SaveManualMoveParams {
  lessonId: string;
  targetDay: number;
  targetPeriod: number;
  versionId: string;
  forcePlace?: boolean; // Allow placement even with conflicts
  swapWithSlotId?: string; // Optional: swap with existing slot
}

interface SaveManualMoveResult {
  success: boolean;
  message: string;
  conflict?: {
    type: 'teacher' | 'class' | 'both';
    teacherName?: string;
    className?: string;
    details: string;
  };
  needsSwapConfirmation?: boolean;
  existingSlotId?: string;
}

export async function saveManualMove(params: SaveManualMoveParams): Promise<SaveManualMoveResult> {
  try {
    await dbConnect();

    const { lessonId, targetDay, targetPeriod, versionId, forcePlace, swapWithSlotId } = params;

    console.log('💾 saveManualMove called:', {
      lessonId,
      targetDay,
      targetPeriod,
      versionId,
      forcePlace,
      swapWithSlotId,
    });

    // 1. Fetch the lesson with all populated data
    const lesson = await Lesson.findById(lessonId)
      .populate('classId')
      .populate('subjectId')
      .populate('teacherIds')
      .lean();

    if (!lesson) {
      return {
        success: false,
        message: 'Lesson not found',
      };
    }

    // 2. Check if this is a double period
    const isDouble = lesson.periodsPerWeek === 2 && lesson.isDoubleScheduled;
    const periodsNeeded = isDouble ? 2 : 1;

    // 3. Validate target slot(s) are within bounds
    if (targetPeriod < 1 || targetPeriod > 10) {
      return {
        success: false,
        message: 'Invalid period number (must be 1-10)',
      };
    }

    if (isDouble && targetPeriod > 9) {
      return {
        success: false,
        message: 'Cannot place double period in period 10 (needs 2 consecutive slots)',
      };
    }

    // 4. Check for conflicts at target location (unless forcePlace is true)
    const versionObjectId = new mongoose.Types.ObjectId(versionId);
    
    // Check teacher conflicts
    const teacherIds = Array.isArray(lesson.teacherIds) 
      ? lesson.teacherIds.map((t: any) => t._id || t)
      : [lesson.teacherIds];

    const teacherConflicts = await TimetableSlot.find({
      versionId: versionObjectId,
      day: targetDay,
      periodNumber: { $in: isDouble ? [targetPeriod, targetPeriod + 1] : [targetPeriod] },
      lessonId: { $ne: lessonId }, // Exclude the lesson we're moving
    })
      .populate({
        path: 'lessonId',
        populate: [
          { path: 'teacherIds', select: 'name' },
          { path: 'classId', select: 'name grade' },
        ],
      })
      .lean();

    // Check if any teachers overlap
    const conflictingTeachers = teacherConflicts.filter((slot: any) => {
      const slotTeacherIds = slot.lessonId?.teacherIds?.map((t: any) => t._id?.toString() || t.toString()) || [];
      return teacherIds.some((tid: any) => slotTeacherIds.includes(tid.toString()));
    });

    // Check class conflicts
    const classId = lesson.classId._id || lesson.classId;
    const classConflicts = await TimetableSlot.find({
      versionId: versionObjectId,
      classId,
      day: targetDay,
      periodNumber: { $in: isDouble ? [targetPeriod, targetPeriod + 1] : [targetPeriod] },
      lessonId: { $ne: lessonId },
    })
      .populate({
        path: 'lessonId',
        populate: [{ path: 'classId', select: 'name grade' }],
      })
      .lean();

    // 5. Handle conflicts
    if ((conflictingTeachers.length > 0 || classConflicts.length > 0) && !forcePlace && !swapWithSlotId) {
      const conflictDetails = [];
      
      if (conflictingTeachers.length > 0) {
        const teacherNames = conflictingTeachers
          .flatMap((slot: any) => slot.lessonId?.teacherIds?.map((t: any) => t.name) || [])
          .filter((name: string, index: number, self: string[]) => self.indexOf(name) === index)
          .join(', ');
        conflictDetails.push(`Teacher ${teacherNames} is already teaching`);
      }

      if (classConflicts.length > 0) {
        const className = lesson.classId?.name || lesson.classId?.grade || 'Unknown';
        conflictDetails.push(`Class ${className} already has a lesson`);
      }

      // Check if there's an existing slot at this exact position (for swap)
      const existingSlot = teacherConflicts[0] || classConflicts[0];
      
      return {
        success: false,
        message: 'Conflict detected at target position',
        conflict: {
          type: conflictingTeachers.length > 0 && classConflicts.length > 0 
            ? 'both' 
            : conflictingTeachers.length > 0 
            ? 'teacher' 
            : 'class',
          teacherName: conflictingTeachers.length > 0 
            ? conflictingTeachers[0].lessonId?.teacherIds?.[0]?.name 
            : undefined,
          className: lesson.classId?.name || lesson.classId?.grade,
          details: conflictDetails.join('; '),
        },
        needsSwapConfirmation: !!existingSlot,
        existingSlotId: existingSlot?._id?.toString(),
      };
    }

    // 6. Handle swap if requested
    if (swapWithSlotId) {
      const slotToSwap = await TimetableSlot.findById(swapWithSlotId);
      if (!slotToSwap) {
        return {
          success: false,
          message: 'Target slot for swap not found',
        };
      }

      // Get current position of lesson we're moving
      const currentSlots = await TimetableSlot.find({
        versionId: versionObjectId,
        lessonId,
      });

      if (currentSlots.length === 0) {
        // Lesson is unscheduled - just place it and remove the existing slot
        await TimetableSlot.deleteMany({ _id: swapWithSlotId });
      } else {
        // Swap positions
        const oldDay = currentSlots[0].day;
        const oldPeriod = currentSlots[0].periodNumber;

        // Move existing slot to old position
        await TimetableSlot.updateMany(
          { lessonId: slotToSwap.lessonId, versionId: versionObjectId },
          { day: oldDay, periodNumber: oldPeriod }
        );

        // Delete current position of lesson we're moving
        await TimetableSlot.deleteMany({ _id: { $in: currentSlots.map(s => s._id) } });
      }
    } else {
      // Remove lesson from current position (if any)
      await TimetableSlot.deleteMany({
        versionId: versionObjectId,
        lessonId,
      });
    }

    // 7. Create new slot(s) at target position
    const slotsToCreate = [];
    
    if (isDouble) {
      slotsToCreate.push({
        schoolId: lesson.schoolId,
        versionId: versionObjectId,
        classId,
        lessonId,
        day: targetDay,
        periodNumber: targetPeriod,
        isDoubleStart: true,
        isDoubleEnd: false,
        isLocked: false,
      });
      slotsToCreate.push({
        schoolId: lesson.schoolId,
        versionId: versionObjectId,
        classId,
        lessonId,
        day: targetDay,
        periodNumber: targetPeriod + 1,
        isDoubleStart: false,
        isDoubleEnd: true,
        isLocked: false,
      });
    } else {
      slotsToCreate.push({
        schoolId: lesson.schoolId,
        versionId: versionObjectId,
        classId,
        lessonId,
        day: targetDay,
        periodNumber: targetPeriod,
        isDoubleStart: false,
        isDoubleEnd: false,
        isLocked: false,
      });
    }

    await TimetableSlot.insertMany(slotsToCreate);

    console.log(`✅ Inserted ${slotsToCreate.length} slot(s) for lesson ${lessonId}`);

    // 8. Revalidate paths
    revalidatePath('/dashboard/timetable');

    const actionType = swapWithSlotId ? 'swapped' : forcePlace ? 'force placed' : 'moved';
    
    return {
      success: true,
      message: `✅ Lesson ${actionType} successfully! ${slotsToCreate.length} slot(s) created.`,
    };
  } catch (error) {
    console.error('❌ Error in saveManualMove:', error);
    return {
      success: false,
      message: `Failed to save move: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
