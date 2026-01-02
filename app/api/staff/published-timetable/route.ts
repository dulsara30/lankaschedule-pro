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

    // Emergency Debug Logs
    console.log('DEBUG: Session School ID:', session.user.schoolId);
    console.log('DEBUG: Teacher ID:', session.user.id);

    // SECURITY: Only fetch published timetable for the teacher's school
    // Use .toString() for proper ObjectId comparison
    const publishedVersion = await TimetableVersion.findOne({
      schoolId: session.user.schoolId.toString(),
      isPublished: true,
    }).sort({ createdAt: -1 });

    console.log('DEBUG: Published Version Found:', publishedVersion ? publishedVersion.versionName : 'None');

    if (!publishedVersion) {
      return NextResponse.json({
        success: true,
        version: null,
        mySchedule: [],
      });
    }

    // Fetch all slots for this version with proper population
    const slots = await TimetableSlot.find({
      schoolId: session.user.schoolId.toString(),
      versionId: publishedVersion._id.toString(),
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

    console.log('DEBUG: Raw Slots Count:', slots.length);

    // Filter slots that involve this teacher (checking teacherIds array)
    const mySchedule = [];
    let processedSlots = 0;
    let matchedSlots = 0;
    
    for (const slot of slots) {
      if (!slot.lessonId || !slot.classId) {
        console.log('DEBUG: Skipping slot with null lessonId or classId');
        continue;
      }
      
      processedSlots++;
      const lesson = slot.lessonId as any;
      const classData = slot.classId as any;
      
      if (lesson.teacherIds && Array.isArray(lesson.teacherIds)) {
        // Check if this teacher's ID is in the teacherIds array (use .toString() for proper comparison)
        const isMyLesson = lesson.teacherIds.some(
          (teacher: any) => teacher._id.toString() === session.user.id.toString()
        );
        
        if (isMyLesson) {
          matchedSlots++;
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

    console.log('DEBUG: Processed Slots:', processedSlots);
    console.log('DEBUG: Matched Slots for Teacher:', matchedSlots);
    console.log('DEBUG: Final Schedule Length:', mySchedule.length);

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
