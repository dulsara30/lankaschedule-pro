import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Teacher from '@/models/Teacher';
import School from '@/models/School';

// GET: Fetch all teachers
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

    const teachers = await Teacher.find({ schoolId: school._id })
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: teachers,
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch teachers',
      },
      { status: 500 }
    );
  }
}

// POST: Create a new teacher
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
    const { name, email, subjectsTaught } = body;

    if (!name || !email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name and email are required',
        },
        { status: 400 }
      );
    }

    const teacher = await Teacher.create({
      schoolId: school._id,
      name,
      email: email.toLowerCase(),
      subjectsTaught: subjectsTaught || [],
    });

    return NextResponse.json({
      success: true,
      data: teacher,
      message: 'Teacher created successfully',
    });
  } catch (error: any) {
    console.error('Error creating teacher:', error);

    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teacher email already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create teacher',
      },
      { status: 500 }
    );
  }
}

// PUT: Update a teacher
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { id, name, email, subjectsTaught } = body;

    if (!id || !name || !email) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID, name, and email are required',
        },
        { status: 400 }
      );
    }

    const teacher = await Teacher.findByIdAndUpdate(
      id,
      {
        name,
        email: email.toLowerCase(),
        subjectsTaught: subjectsTaught || [],
      },
      { new: true, runValidators: true }
    );

    if (!teacher) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teacher not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: teacher,
      message: 'Teacher updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating teacher:', error);

    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teacher email already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update teacher',
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a teacher
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teacher ID is required',
        },
        { status: 400 }
      );
    }

    const teacher = await Teacher.findByIdAndDelete(id);

    if (!teacher) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teacher not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Teacher deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete teacher',
      },
      { status: 500 }
    );
  }
}
