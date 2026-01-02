import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
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

    // Fetch all slots for this version with proper population
    const slots = await TimetableSlot.find({
      schoolId: session.user.schoolId,
      versionId: publishedVersion._id,
    })
      .populate({
        path: 'lessonId',
        populate: [
          { path: 'subjectIds', model: 'Subject' },
          { path: 'teacherIds', model: 'Teacher' },
        ]
      })
      .populate('classId')
      .lean();

    // Filter slots that involve this teacher (checking teacherIds array)
    const mySchedule = [];
    for (const slot of slots) {
      if (!slot.lessonId || !slot.classId) continue;
      
      const lesson = slot.lessonId as any;
      const classData = slot.classId as any;
      
      if (lesson.teacherIds && Array.isArray(lesson.teacherIds)) {
        // Check if this teacher's ID is in the teacherIds array
        const isMyLesson = lesson.teacherIds.some(
          (teacher: any) => teacher._id.toString() === session.user.id
        );
        
        if (isMyLesson) {
          // Get subject names from populated subjectIds
          const subjectNames = lesson.subjectIds && Array.isArray(lesson.subjectIds)
            ? lesson.subjectIds.map((s: any) => s.name).join(', ')
            : 'Unknown Subject';
          
          mySchedule.push({
            _id: slot._id.toString(),
            day: slot.day,
            periodNumber: slot.periodNumber,
            subject: subjectNames,
            className: classData.name || 'Unknown Class',
            isDoubleStart: slot.isDoubleStart || false,
            isDoubleEnd: slot.isDoubleEnd || false,
          });
        }
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
