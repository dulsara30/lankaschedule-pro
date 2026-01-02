import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import School from '@/models/School';

// POST: Publish a version to staff
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
    const { versionId, adminNote } = body;

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: 'Version ID is required' },
        { status: 400 }
      );
    }

    // Validate adminNote length if provided
    if (adminNote && adminNote.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Admin note cannot exceed 500 characters' },
        { status: 400 }
      );
    }

    const version = await TimetableVersion.findById(versionId);
    if (!version) {
      return NextResponse.json(
        { success: false, error: 'Version not found' },
        { status: 404 }
      );
    }

    // Check if version belongs to this school
    if (version.schoolId.toString() !== school._id.toString()) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Update version to published with admin note
    version.isPublished = true;
    version.adminNote = adminNote || '';
    await version.save();

    console.log(`✅ Published version "${version.versionName}" to staff portal`);
    if (adminNote) {
      console.log(`📝 Admin note: ${adminNote}`);
    }

    return NextResponse.json({
      success: true,
      data: version,
      message: 'Version published to staff portal successfully',
    });
  } catch (error) {
    console.error('Error publishing version:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to publish version',
      },
      { status: 500 }
    );
  }
}

// DELETE: Unpublish a version from staff portal
export async function DELETE(request: Request) {
  try {
    await dbConnect();

    const school = await School.findOne();
    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'School not configured',
      }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: 'Version ID is required' },
        { status: 400 }
      );
    }

    const version = await TimetableVersion.findById(versionId);
    if (!version) {
      return NextResponse.json(
        { success: false, error: 'Version not found' },
        { status: 404 }
      );
    }

    // Check if version belongs to this school
    if (version.schoolId.toString() !== school._id.toString()) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Unpublish version
    version.isPublished = false;
    version.adminNote = '';
    await version.save();

    console.log(`✅ Unpublished version "${version.versionName}" from staff portal`);

    return NextResponse.json({
      success: true,
      data: version,
      message: 'Version unpublished from staff portal',
    });
  } catch (error) {
    console.error('Error unpublishing version:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to unpublish version',
      },
      { status: 500 }
    );
  }
}
