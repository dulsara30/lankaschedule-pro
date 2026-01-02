import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
import Lesson from '@/models/Lesson';
import Class from '@/models/Class';
import Subject from '@/models/Subject';

export async function GET() {
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

    await dbConnect();

    // SECURITY: Only fetch published timetable for the teacher's school
    const publishedVersion = await TimetableVersion.findOne({
      schoolId: session.user.schoolId,
      isPublished: true,
    }).sort({ createdAt: -1 });

    if (!publishedVersion) {
      return NextResponse.json({
        success: true,
        version: null,
        mySchedule: [],
      });
    }

    // Fetch all slots for this version that belong to the logged-in teacher
    const slots = await TimetableSlot.find({
      schoolId: session.user.schoolId,
      versionId: publishedVersion._id,
    })
      .populate('lessonId')
      .populate('classId')
      .lean();

    // Filter slots that involve this teacher
    const mySchedule = [];
    for (const slot of slots) {
      const lesson = slot.lessonId as any;
      if (lesson && lesson.teacherId && lesson.teacherId.toString() === session.user.id) {
        const classData = slot.classId as any;
        const subject = await Subject.findById(lesson.subjectId);
        
        mySchedule.push({
          _id: slot._id.toString(),
          day: slot.day,
          periodNumber: slot.periodNumber,
          subject: subject?.name || 'Unknown Subject',
          className: classData?.name || 'Unknown Class',
          isDoubleStart: slot.isDoubleStart,
          isDoubleEnd: slot.isDoubleEnd,
        });
      }
    }

    return NextResponse.json({
      success: true,
      version: {
        versionName: publishedVersion.versionName,
        adminNote: publishedVersion.adminNote,
        publishedAt: publishedVersion.updatedAt,
      },
      mySchedule,
    });
  } catch (error) {
    console.error('Error fetching published timetable:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch published timetable' },
      { status: 500 }
    );
  }
}
