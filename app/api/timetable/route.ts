import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';
import School from '@/models/School';

// GET: Fetch all timetable slots with populated references
export async function GET() {
  try {
    await dbConnect();

    const school = await School.findOne();
    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'School not configured',
      }, { status: 400 });
    }

    const slots = await TimetableSlot.find({ schoolId: school._id })
      .populate({
        path: 'classId',
        select: 'name grade',
      })
      .populate({
        path: 'lessonId',
        populate: [
          { path: 'subjectIds', select: 'name color' },
          { path: 'teacherIds', select: 'name email' },
          { path: 'classIds', select: 'name grade' },
        ],
      })
      .sort({ day: 1, periodNumber: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: slots,
    });
  } catch (error) {
    console.error('Error fetching timetable slots:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch timetable slots',
      },
      { status: 500 }
    );
  }
}
