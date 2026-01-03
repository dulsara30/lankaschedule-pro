import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
import School from '@/models/School';

// GET: Fetch all versions
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.schoolId) {
      return NextResponse.json({
        success: true,
        data: [],
        versions: [],
        message: 'No school configured yet',
      });
    }

    await dbConnect();

    const school = await School.findById(session.user.schoolId);
    if (!school) {
      return NextResponse.json({
        success: true,
        data: [],
        versions: [],
        message: 'School not found',
      });
    }

    const versions = await TimetableVersion.find({ schoolId: school._id })
      .sort({ isSaved: 1, createdAt: -1 }) // Draft first, then saved versions by date
      .lean();

    // Get slot count for each version
    const versionsWithStats = await Promise.all(
      versions.map(async (version) => {
        const slotCount = await TimetableSlot.countDocuments({ versionId: version._id });
        console.log(`📊 Version "${version.versionName}" (${version.isSaved ? 'Saved' : 'Draft'}): ${slotCount} slots`);
        return {
          ...version,
          slotCount,
        };
      })
    );

    console.log(`✅ Versions API: Returning ${versionsWithStats.length} versions`);

    return NextResponse.json({
      success: true,
      data: versionsWithStats,
      versions: versionsWithStats,
    });
  } catch (error) {
    console.error('Error fetching versions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch versions',
      },
      { status: 500 }
    );
  }
}

// POST: Save/update a version (e.g., rename and mark as saved)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.schoolId) {
      return NextResponse.json({
        success: false,
        error: 'School not configured',
      }, { status: 400 });
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
    const { versionId, versionName, isSaved } = body;

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: 'Version ID is required' },
        { status: 400 }
      );
    }

    const updateData: { versionName?: string; isSaved?: boolean } = {};
    if (versionName !== undefined) updateData.versionName = versionName;
    if (isSaved !== undefined) updateData.isSaved = isSaved;

    const updatedVersion = await TimetableVersion.findByIdAndUpdate(
      versionId,
      updateData,
      { new: true }
    );

    if (!updatedVersion) {
      return NextResponse.json(
        { success: false, error: 'Version not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedVersion,
      message: 'Version updated successfully',
    });
  } catch (error) {
    console.error('Error updating version:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update version',
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a version and all its slots (Cascading Deletion)
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.schoolId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
      }, { status: 401 });
    }

    await dbConnect();

    // Ensure models are registered (prevent MissingSchemaError)
    const TimetableVersionModel = TimetableVersion;
    const TimetableSlotModel = TimetableSlot;

    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: 'Version ID is required' },
        { status: 400 }
      );
    }

    console.log(`🗑️  DELETE REQUEST: Version ID ${versionId}`);

    // Verify version exists and belongs to user's school
    const version = await TimetableVersionModel.findById(versionId);
    
    if (!version) {
      return NextResponse.json(
        { success: false, error: 'Version not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (version.schoolId.toString() !== session.user.schoolId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to delete this version' },
        { status: 403 }
      );
    }

    console.log(`   📋 Deleting version: "${version.versionName}"`);

    // CASCADING DELETION: Delete all slots associated with this version FIRST
    const deletedSlots = await TimetableSlotModel.deleteMany({ versionId: versionId });
    console.log(`   ✅ Deleted ${deletedSlots.deletedCount} associated slots`);
    
    // Delete the version metadata
    const deletedVersion = await TimetableVersionModel.findByIdAndDelete(versionId);

    if (!deletedVersion) {
      console.error('   ❌ Version document not found after slot deletion');
      return NextResponse.json(
        { success: false, error: 'Version not found after slot cleanup' },
        { status: 404 }
      );
    }

    console.log(`   ✅ Version "${deletedVersion.versionName}" deleted successfully`);

    return NextResponse.json({
      success: true,
      message: `Version and ${deletedSlots.deletedCount} associated slots deleted successfully`,
      deletedSlotCount: deletedSlots.deletedCount,
      versionName: deletedVersion.versionName,
    });
  } catch (error) {
    console.error('❌ Error deleting version:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete version',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
