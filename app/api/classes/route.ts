import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import Class from '@/models/Class';
import School from '@/models/School';

// GET: Fetch all classes
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

    const classes = await Class.find({ schoolId: school._id })
      .sort({ grade: 1, name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: classes,
    });
  } catch (error) {
    console.error('Error fetching classes:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch classes',
      },
      { status: 500 }
    );
  }
}

// POST: Create a new class
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
    const { name, grade, stream } = body;

    if (!name || !grade) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name and grade are required',
        },
        { status: 400 }
      );
    }

    const classData = await Class.create({
      schoolId: school._id,
      name,
      grade,
      stream: stream || '',
    });

    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/lessons');

    return NextResponse.json({
      success: true,
      data: classData,
      message: 'Class created successfully',
    });
  } catch (error: unknown) {
    console.error('Error creating class:', error);

    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Class name already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create class',
      },
      { status: 500 }
    );
  }
}

// PUT: Update a class
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { id, name, grade, stream } = body;

    if (!id || !name || !grade) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID, name, and grade are required',
        },
        { status: 400 }
      );
    }

    const classData = await Class.findByIdAndUpdate(
      id,
      { name, grade, stream: stream || '' },
      { new: true, runValidators: true }
    );

    if (!classData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Class not found',
        },
        { status: 404 }
      );
    }

    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/lessons');

    return NextResponse.json({
      success: true,
      data: classData,
      message: 'Class updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating class:', error);

    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Class name already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update class',
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a class
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Class ID is required',
        },
        { status: 400 }
      );
    }

    const classData = await Class.findByIdAndDelete(id);

    if (!classData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Class not found',
        },
        { status: 404 }
      );
    }

    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/lessons');

    return NextResponse.json({
      success: true,
      message: 'Class deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting class:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete class',
      },
      { status: 500 }
    );
  }
}
