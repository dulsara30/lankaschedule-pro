import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';
import TimetableVersion from '@/models/TimetableVersion';
import School from '@/models/School';

/**
 * POST: Bulk save timetable slots from Python CP-SAT solver
 * Accepts 813+ slots and saves them efficiently to MongoDB
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.schoolId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized - School not configured',
      }, { status: 401 });
    }

    await dbConnect();

    const school = await School.findById(session.user.schoolId);
    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'School not found',
      }, { status: 404 });
    }

    const body = await request.json();
    const { slots, versionName, conflicts } = body;

    if (!slots || !Array.isArray(slots)) {
      return NextResponse.json(
        { success: false, error: 'Slots array is required' },
        { status: 400 }
      );
    }

    console.log(`📦 BULK SAVE: Received ${slots.length} slots from Python CP-SAT solver`);
    console.log(`   Conflicts: ${conflicts}`);
    console.log(`   Version Name: ${versionName || 'Draft'}`);

    // Create or update version
    let version;
    
    // Check for existing draft version
    const existingDraft = await TimetableVersion.findOne({
      schoolId: school._id,
      isSaved: false
    });

    if (existingDraft) {
      // Delete old slots for this version
      const deletedCount = await TimetableSlot.deleteMany({ versionId: existingDraft._id });
      console.log(`   🗑️ Deleted ${deletedCount.deletedCount} old draft slots`);
      
      version = existingDraft;
      version.versionName = versionName || 'Draft';
      await version.save();
    } else {
      // Create new version
      version = await TimetableVersion.create({
        schoolId: school._id,
        versionName: versionName || 'Draft',
        isSaved: false,
      });
    }

    console.log(`   📋 Version ID: ${version._id}`);

    // Prepare slots for bulk insert
    const slotsToInsert = slots.map(slot => ({
      schoolId: school._id,
      versionId: version._id,
      classId: slot.classId,
      lessonId: slot.lessonId,
      day: slot.day,
      periodNumber: slot.periodNumber,
      isDoubleStart: slot.isDoubleStart || false,
      isDoubleEnd: slot.isDoubleEnd || false,
      isLocked: false,
    }));

    // Bulk insert with ordered: false for better performance
    const insertResult = await TimetableSlot.insertMany(slotsToInsert, {
      ordered: false,
      lean: true
    });

    console.log(`   ✅ Inserted ${insertResult.length} slots successfully`);

    // Verify slot count
    const verifyCount = await TimetableSlot.countDocuments({ versionId: version._id });
    console.log(`   🔍 Verification: ${verifyCount} slots in database`);

    if (verifyCount !== slots.length) {
      console.warn(`   ⚠️ Warning: Expected ${slots.length} slots but found ${verifyCount}`);
    }

    return NextResponse.json({
      success: true,
      versionId: version._id,
      versionName: version.versionName,
      slotsInserted: insertResult.length,
      conflicts,
      message: `Saved ${insertResult.length} slots successfully`,
    });

  } catch (error) {
    console.error('❌ Error in bulk save:', error);
    
    // Handle duplicate key errors gracefully
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json({
        success: false,
        error: 'Duplicate slots detected',
        details: error instanceof Error ? error.message : 'Duplicate key error',
      }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save timetable',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
