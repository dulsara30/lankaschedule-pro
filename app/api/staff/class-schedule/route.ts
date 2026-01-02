import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
import Subject from '@/models/Subject';
import Lesson from '@/models/Lesson';

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

    // Emergency Debug Logs
    console.log('DEBUG: Class Schedule - Session School ID:', session.user.schoolId);
    console.log('DEBUG: Class Schedule - Requested Class ID:', classId);

    // SECURITY: Only fetch published timetable for the teacher's school
    // Use .toString() for proper ObjectId comparison
    const publishedVersion = await TimetableVersion.findOne({
      schoolId: session.user.schoolId.toString(),
      isPublished: true,
    }).sort({ createdAt: -1 });

    console.log('DEBUG: Class Schedule - Published Version Found:', publishedVersion ? publishedVersion.versionName : 'None');

    if (!publishedVersion) {
      return NextResponse.json({
        success: true,
        schedule: [],
      });
    }

    // SECURITY: Fetch slots only for the specified class in the teacher's school
    const slots = await TimetableSlot.find({
      schoolId: session.user.schoolId.toString(),
      versionId: publishedVersion._id.toString(),
      classId: classId.toString(),
    })
      .populate({
        path: 'lessonId',
        populate: [
          { path: 'subjectIds', model: 'Subject' },
        ]
      })
      .lean();

    console.log('DEBUG: Class Schedule - Raw Slots Count:', slots.length);

    const schedule = [];
    for (const slot of slots) {
      if (!slot.lessonId) continue;
      
      const lesson = slot.lessonId as any;
      
      // Get subject names from populated subjectIds
      const subjectNames = lesson.subjectIds && Array.isArray(lesson.subjectIds)
        ? lesson.subjectIds.map((s: any) => s.name).join(', ')
        : 'Unknown Subject';
      
      schedule.push({
        _id: slot._id.toString(),
        day: slot.day,
        periodNumber: slot.periodNumber,
        subject: subjectNames,
        className: null, // Not needed for class view
        isDoubleStart: slot.isDoubleStart || false,
        isDoubleEnd: slot.isDoubleEnd || false,
      });
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
