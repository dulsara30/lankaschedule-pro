import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { slotId, newDay, newPeriod } = body;

    if (!slotId || !newDay || !newPeriod) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: slotId, newDay, newPeriod' },
        { status: 400 }
      );
    }

    // Find the slot
    const slot = await TimetableSlot.findById(slotId);
    if (!slot) {
      return NextResponse.json(
        { success: false, message: 'Slot not found' },
        { status: 404 }
      );
    }

    // Check if slot is locked
    if (slot.isLocked) {
      return NextResponse.json(
        { success: false, message: 'Cannot move locked slot' },
        { status: 403 }
      );
    }

    // Handle double periods - need to move both slots
    const slotsToUpdate = [];
    
    if (slot.isDoubleStart) {
      // Find the corresponding double-end slot
      const doubleEndSlot = await TimetableSlot.findOne({
        versionId: slot.versionId,
        classId: slot.classId,
        lessonId: slot.lessonId,
        day: slot.day,
        periodNumber: slot.periodNumber + 1,
        isDoubleEnd: true,
      });

      slotsToUpdate.push({
        slot,
        newDay,
        newPeriod,
      });

      if (doubleEndSlot) {
        slotsToUpdate.push({
          slot: doubleEndSlot,
          newDay,
          newPeriod: newPeriod + 1,
        });
      }
    } else if (slot.isDoubleEnd) {
      // Find the corresponding double-start slot
      const doubleStartSlot = await TimetableSlot.findOne({
        versionId: slot.versionId,
        classId: slot.classId,
        lessonId: slot.lessonId,
        day: slot.day,
        periodNumber: slot.periodNumber - 1,
        isDoubleStart: true,
      });

      if (doubleStartSlot) {
        slotsToUpdate.push({
          slot: doubleStartSlot,
          newDay,
          newPeriod,
        });
      }

      slotsToUpdate.push({
        slot,
        newDay,
        newPeriod: newPeriod + 1,
      });
    } else {
      // Single period
      slotsToUpdate.push({
        slot,
        newDay,
        newPeriod,
      });
    }

    // Update all slots
    for (const update of slotsToUpdate) {
      update.slot.day = update.newDay;
      update.slot.periodNumber = update.newPeriod;
      await update.slot.save();
    }

    // Revalidate paths
    revalidatePath('/dashboard/timetable');
    revalidatePath('/dashboard/lessons');

    return NextResponse.json({
      success: true,
      message: `Moved ${slotsToUpdate.length} slot(s) to ${newDay} Period ${newPeriod}`,
      movedSlots: slotsToUpdate.length,
    });
  } catch (error) {
    console.error('Error moving slot:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
