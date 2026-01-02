import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';
import TimetableVersion from '@/models/TimetableVersion';
import School from '@/models/School';
import Subject from '@/models/Subject';
import Teacher from '@/models/Teacher';
import Class from '@/models/Class';
import Lesson from '@/models/Lesson';

// GET: Fetch all timetable slots with populated references
// Supports optional versionId query parameter
export async function GET(request: Request) {
  try {
    await dbConnect();

    const school = await School.findOne();
    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'School not configured',
      }, { status: 400 });
    }

    // Extract versionId from query params if provided
    const { searchParams } = new URL(request.url);
    const versionIdParam = searchParams.get('versionId');
    
    let versionId = versionIdParam;
    
    // If no versionId specified, fetch the latest (draft or most recent saved)
    if (!versionId) {
      console.log('🔍 No versionId specified, fetching latest version...');
      const latestVersion = await TimetableVersion.findOne({ schoolId: school._id })
        .sort({ isSaved: 1, createdAt: -1 }) // Draft first, then by date
        .lean();
      
      console.log('📦 Latest version found:', latestVersion);
      
      if (!latestVersion) {
        console.log('⚠️ No versions found in database');
        return NextResponse.json({
          success: true,
          data: [],
          message: 'No timetable versions found',
        });
      }
      
      versionId = latestVersion._id.toString();
      console.log(`✅ Using version: ${versionId} (${latestVersion.versionName})`);
    }

    console.log(`🔍 Querying slots with: schoolId=${school._id}, versionId=${versionId}`);

    // Debug: Check total slots in database
    const totalSlots = await TimetableSlot.countDocuments({ schoolId: school._id });
    const slotsWithVersion = await TimetableSlot.countDocuments({ schoolId: school._id, versionId: { $exists: true } });
    const slotsWithoutVersion = await TimetableSlot.countDocuments({ schoolId: school._id, versionId: { $exists: false } });
    console.log(`📊 Database stats: Total=${totalSlots}, WithVersion=${slotsWithVersion}, WithoutVersion=${slotsWithoutVersion}`);

    const slots = await TimetableSlot.find({ 
      schoolId: school._id,
      versionId 
    })
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

    console.log(`✅ Timetable API: Fetched ${slots.length} slots for version ${versionId}`);
    if (slots.length > 0) {
      console.log('📊 Sample slot:', JSON.stringify(slots[0], null, 2));
      console.log('🔍 First slot versionId:', slots[0].versionId);
      console.log('🔍 Queried versionId:', versionId);
      if (slots[0].versionId && versionId) {
        const firstSlotVersionId = slots[0].versionId.toString();
        const queriedVersionId = versionId.toString();
        console.log('🔍 Version IDs match:', firstSlotVersionId === queriedVersionId);
      }
    } else {
      console.warn('⚠️ No slots found for versionId:', versionId);
    }

    return NextResponse.json({
      success: true,
      data: slots,
      versionId,
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
