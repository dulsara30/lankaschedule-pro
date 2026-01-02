import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
import Lesson from '@/models/Lesson';
import Subject from '@/models/Subject';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'teacher') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!session.user.schoolId) {
      return NextResponse.json(
        { success: false, error: 'No school associated with this account' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');

    if (!classId) {
      return NextResponse.json(
        { success: false, error: 'Class ID is required' },
        { status: 400 }
      );
    }

    await dbConnect();

    // SECURITY: Only fetch published timetable for the teacher's school
    const publishedVersion = await TimetableVersion.findOne({
      schoolId: session.user.schoolId,
      isPublished: true,
    }).sort({ createdAt: -1 });

    if (!publishedVersion) {
      return NextResponse.json({
        success: true,
        schedule: [],
      });
    }

    // SECURITY: Fetch slots only for the specified class in the teacher's school
    const slots = await TimetableSlot.find({
      schoolId: session.user.schoolId,
      versionId: publishedVersion._id,
      classId: classId,
    })
      .populate('lessonId')
      .lean();

    const schedule = [];
    for (const slot of slots) {
      const lesson = slot.lessonId as any;
      if (lesson) {
        const subject = await Subject.findById(lesson.subjectId);
        
        schedule.push({
          _id: slot._id.toString(),
          day: slot.day,
          periodNumber: slot.periodNumber,
          subject: subject?.name || 'Unknown Subject',
          className: null, // Not needed for class view
          isDoubleStart: slot.isDoubleStart,
          isDoubleEnd: slot.isDoubleEnd,
        });
      }
    }

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error('Error fetching class schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch class schedule' },
      { status: 500 }
    );
  }
}
