import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import Teacher from '@/models/Teacher';
import School from '@/models/School';
import Lesson from '@/models/Lesson';

// GET: Fetch all teachers with lesson counts and workload
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

    // Migration: Ensure all existing teachers have a grade
    await Teacher.updateMany(
      { schoolId: school._id, teacherGrade: { $exists: false } },
      { $set: { teacherGrade: 'SLTS 3 I' } }
    );

    const teachers = await Teacher.find({ schoolId: school._id })
      .sort({ name: 1 })
      .lean();

    // Get all lessons to calculate workload for each teacher
    const lessons = await Lesson.find({ schoolId: school._id }).lean();

    // Enrich teachers with lesson count and workload
    const enrichedTeachers = teachers.map(teacher => {
      const teacherLessons = lessons.filter(lesson => 
        lesson.teacherIds.some((id: { toString: () => string }) => id.toString() === teacher._id.toString())
      );

      const lessonCount = teacherLessons.length;
      
      // Calculate total periods (singles + doubles*2)
      const totalPeriods = teacherLessons.reduce((sum, lesson) => {
        return sum + lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
      }, 0);

      return {
        ...teacher,
        teacherGrade: teacher.teacherGrade || 'SLTS 3 I', // Ensure grade is always present
        lessonCount,
        totalPeriods,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedTeachers,
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
    const { name, email, teacherGrade, subjectsTaught } = body;

    // Debug logging
    console.log('POST /api/teachers - Received body:', { name, email, teacherGrade, subjectsTaught });

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name is required',
        },
        { status: 400 }
      );
    }

    const teacherData = {
      schoolId: school._id,
      name: name.trim(),
      email: email ? email.toLowerCase().trim() : undefined,
      teacherGrade: teacherGrade || 'SLTS 3 I',
      subjectsTaught: subjectsTaught || [],
    };

    console.log('POST /api/teachers - Creating teacher with data:', teacherData);

    const teacher = await Teacher.create(teacherData);

    console.log('POST /api/teachers - Created teacher:', { _id: teacher._id, name: teacher.name, teacherGrade: teacher.teacherGrade });

    // Revalidate lessons page to reflect changes
    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/teachers');

    return NextResponse.json({
      success: true,
      data: teacher,
      message: 'Teacher created successfully',
    });
  } catch (error: unknown) {
    console.error('Error creating teacher:', error);

    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
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
        error: error instanceof Error ? error.message : 'Failed to create teacher',
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
    const { id, name, email, teacherGrade, subjectsTaught } = body;

    // Debug logging
    console.log('PUT /api/teachers - Received body:', { id, name, email, teacherGrade, subjectsTaught });

    if (!id || !name) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID and name are required',
        },
        { status: 400 }
      );
    }

    // Build update object with all required fields
    const updateData: {
      name: string;
      email?: string;
      teacherGrade: string;
      subjectsTaught: string[];
    } = {
      name: name.trim(),
      teacherGrade: teacherGrade || 'SLTS 3 I',
      subjectsTaught: subjectsTaught || [],
    };

    // Handle email properly - only set if provided and not empty
    if (email !== undefined && email !== null) {
      const trimmedEmail = email.trim();
      if (trimmedEmail) {
        updateData.email = trimmedEmail.toLowerCase();
      }
    }

    console.log('PUT /api/teachers - Update data:', updateData);

    const teacher = await Teacher.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log('PUT /api/teachers - Updated teacher:', teacher ? { _id: teacher._id, name: teacher.name, teacherGrade: teacher.teacherGrade } : 'not found');

    if (!teacher) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teacher not found',
        },
        { status: 404 }
      );
    }

    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/teachers');

    return NextResponse.json({
      success: true,
      data: teacher,
      message: 'Teacher updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating teacher:', error);

    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
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
        error: error instanceof Error ? error.message : 'Failed to update teacher',
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

    revalidatePath('/dashboard/lessons');
    revalidatePath('/dashboard/teachers');

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
