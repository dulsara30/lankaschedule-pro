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

    // Force model registration to prevent MissingSchemaError during population
    [Subject, Teacher, Class, Lesson, TimetableSlot, TimetableVersion, School].forEach(m => m?.modelName);

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
    
    // If no versionId specified, use smart selection: prefer versions with slots
    if (!versionId) {
      console.log('🔍 No versionId specified, using smart version selection...');
      
      // Get all versions ordered by priority: saved/published first, then drafts
      const allVersions = await TimetableVersion.find({ schoolId: school._id })
        .sort({ isSaved: -1, createdAt: -1 }) // Saved first, then by date
        .lean();
      
      console.log(`📦 Found ${allVersions.length} versions in database`);
      
      if (allVersions.length === 0) {
        console.log('⚠️ No versions found in database');
        return NextResponse.json({
          success: true,
          data: [],
          message: 'No timetable versions found',
        });
      }
      
      // Check each version for slots, prioritizing saved/published versions
      let selectedVersion = null;
      for (const version of allVersions) {
        const slotCount = await TimetableSlot.countDocuments({ 
          versionId: version._id,
          schoolId: school._id 
        });
        console.log(`   Version "${version.versionName}" (${version.isSaved ? 'Saved' : 'Draft'}): ${slotCount} slots`);
        
        if (slotCount > 0 && !selectedVersion) {
          selectedVersion = version;
          console.log(`   ✅ Selected this version (has slots)`);
        }
      }
      
      // If no version has slots, use the most recent one
      if (!selectedVersion) {
        selectedVersion = allVersions[0];
        console.log(`   ⚠️ No version has slots, using latest: "${selectedVersion.versionName}"`);
      }
      
      versionId = selectedVersion._id.toString();
      console.log(`✅ Smart selection result: ${versionId} (${selectedVersion.versionName})`);
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
        strictPopulate: false,
      })
      .populate({
        path: 'lessonId',
        strictPopulate: false,
        populate: [
          { path: 'subjectIds', select: 'name color', strictPopulate: false },
          { path: 'teacherIds', select: 'name email', strictPopulate: false },
          { path: 'classIds', select: 'name grade', strictPopulate: false },
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

    // Fetch unplaced lessons from the version document
    const versionDoc = await TimetableVersion.findById(versionId).lean();
    const unplacedLessons = versionDoc?.unplacedLessons || [];
    console.log(`📋 Timetable API: Found ${unplacedLessons.length} unplaced lessons in version document`);

    return NextResponse.json({
      success: true,
      data: slots,
      versionId,
      unplacedLessons, // Include unplaced lessons from version document
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
