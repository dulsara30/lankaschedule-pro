import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
import School from '@/models/School';

// GET: Fetch all versions
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

    const versions = await TimetableVersion.find({ schoolId: school._id })
      .sort({ isSaved: 1, createdAt: -1 }) // Draft first, then saved versions by date
      .lean();

    // Get slot count for each version
    const versionsWithStats = await Promise.all(
      versions.map(async (version) => {
        const slotCount = await TimetableSlot.countDocuments({ versionId: version._id });
        return {
          ...version,
          slotCount,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: versionsWithStats,
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
    await dbConnect();

    const school = await School.findOne();
    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'School not configured',
      }, { status: 400 });
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

// DELETE: Delete a version and all its slots
export async function DELETE(request: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: 'Version ID is required' },
        { status: 400 }
      );
    }

    // Delete all slots associated with this version
    const deletedSlots = await TimetableSlot.deleteMany({ versionId });
    
    // Delete the version itself
    const deletedVersion = await TimetableVersion.findByIdAndDelete(versionId);

    if (!deletedVersion) {
      return NextResponse.json(
        { success: false, error: 'Version not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Version deleted successfully. Removed ${deletedSlots.deletedCount} slots.`,
    });
  } catch (error) {
    console.error('Error deleting version:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete version',
      },
      { status: 500 }
    );
  }
}
