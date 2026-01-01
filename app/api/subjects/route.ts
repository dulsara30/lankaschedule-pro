import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import Subject from '@/models/Subject';
import School from '@/models/School';
import { generateBrightColor } from '@/lib/utils';

// GET: Fetch all subjects
export async function GET() {
  try {
    await dbConnect();

    // Get the first school (MVP - single tenant)
    const school = await School.findOne();
    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'School not configured',
      }, { status: 400 });
    }

    const subjects = await Subject.find({ schoolId: school._id })
      .sort({ category: 1, name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch subjects',
      },
      { status: 500 }
    );
  }
}

// POST: Create a new subject
export async function POST(request: NextRequest) {
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
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name is required',
        },
        { status: 400 }
      );
    }

    // Trim and normalize the name
    const trimmedName = name.trim();

    // Check for case-insensitive duplicate within the same school
    const existingSubject = await Subject.findOne({
      schoolId: school._id,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });

    if (existingSubject) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject name already exists',
        },
        { status: 400 }
      );
    }

    // Auto-generate a bright color
    const autoColor = generateBrightColor();

    const subject = await Subject.create({
      schoolId: school._id,
      name: trimmedName,
      color: autoColor,
    });

    // Revalidate pages to reflect changes
    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/subjects');

    return NextResponse.json({
      success: true,
      data: subject,
      message: 'Subject created successfully',
    });
  } catch (error: any) {
    console.error('Error creating subject:', error);
    
    // Handle duplicate key error (fallback)
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject name already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create subject',
      },
      { status: 500 }
    );
  }
}

// PUT: Update a subject
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { id, name, color } = body;

    if (!id || !name) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID and name are required',
        },
        { status: 400 }
      );
    }

    // Trim and normalize the name
    const trimmedName = name.trim();

    // Get the subject being updated to check its schoolId
    const currentSubject = await Subject.findById(id);
    if (!currentSubject) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject not found',
        },
        { status: 404 }
      );
    }

    // Check for case-insensitive duplicate within the same school (excluding current subject)
    const existingSubject = await Subject.findOne({
      _id: { $ne: id },
      schoolId: currentSubject.schoolId,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });

    if (existingSubject) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject name already exists',
        },
        { status: 400 }
      );
    }

    const updateData: any = { name: trimmedName };
    if (color) {
      updateData.color = color;
    }

    const subject = await Subject.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Revalidate pages to reflect changes
    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/subjects');

    return NextResponse.json({
      success: true,
      data: subject,
      message: 'Subject updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating subject:', error);

    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject name already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update subject',
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a subject
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject ID is required',
        },
        { status: 400 }
      );
    }

    const subject = await Subject.findByIdAndDelete(id);

    if (!subject) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subject not found',
        },
        { status: 404 }
      );
    }

    // Revalidate pages to reflect changes
    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/subjects');

    return NextResponse.json({
      success: true,
      message: 'Subject deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting subject:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete subject',
      },
      { status: 500 }
    );
  }
}
