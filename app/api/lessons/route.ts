import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Lesson from '@/models/Lesson';
import School from '@/models/School';
import Subject from '@/models/Subject';
import Teacher from '@/models/Teacher';
import Class from '@/models/Class';

// GET: Fetch all lessons with populated references
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

    const lessons = await Lesson.find({ schoolId: school._id })
      .populate('subjectIds', 'name code category')
      .populate('teacherIds', 'name email')
      .populate('classIds', 'name gradeLevel')
      .sort({ lessonName: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: lessons,
    });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch lessons',
      },
      { status: 500 }
    );
  }
}

// POST: Create a new lesson
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
    const {
      lessonName,
      subjectIds,
      teacherIds,
      classIds,
      periodsPerWeek,
      isDoublePeriod,
      color,
      notes,
    } = body;

    // Validation
    if (!lessonName || !Array.isArray(subjectIds) || !Array.isArray(teacherIds) || !Array.isArray(classIds)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lesson name, subjects, teachers, and classes are required',
        },
        { status: 400 }
      );
    }

    if (subjectIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one subject must be selected',
        },
        { status: 400 }
      );
    }

    if (teacherIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one teacher must be assigned',
        },
        { status: 400 }
      );
    }

    if (classIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one class must be selected',
        },
        { status: 400 }
      );
    }

    if (!periodsPerWeek || periodsPerWeek < 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Periods per week must be at least 1',
        },
        { status: 400 }
      );
    }

    // Verify that all referenced documents exist
    const [subjects, teachers, classes] = await Promise.all([
      Subject.find({ _id: { $in: subjectIds }, schoolId: school._id }),
      Teacher.find({ _id: { $in: teacherIds }, schoolId: school._id }),
      Class.find({ _id: { $in: classIds }, schoolId: school._id }),
    ]);

    if (subjects.length !== subjectIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more subjects not found',
        },
        { status: 400 }
      );
    }

    if (teachers.length !== teacherIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more teachers not found',
        },
        { status: 400 }
      );
    }

    if (classes.length !== classIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more classes not found',
        },
        { status: 400 }
      );
    }

    const lesson = await Lesson.create({
      schoolId: school._id,
      lessonName,
      subjectIds,
      teacherIds,
      classIds,
      periodsPerWeek: periodsPerWeek || 1,
      isDoublePeriod: isDoublePeriod || false,
      color: color || '#3B82F6',
      notes: notes || '',
    });

    // Populate the created lesson
    const populatedLesson = await Lesson.findById(lesson._id)
      .populate('subjectIds', 'name code category')
      .populate('teacherIds', 'name email')
      .populate('classIds', 'name gradeLevel');

    return NextResponse.json({
      success: true,
      data: populatedLesson,
      message: 'Lesson created successfully',
    });
  } catch (error: any) {
    console.error('Error creating lesson:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create lesson',
      },
      { status: 500 }
    );
  }
}

// PUT: Update a lesson
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      id,
      lessonName,
      subjectIds,
      teacherIds,
      classIds,
      periodsPerWeek,
      isDoublePeriod,
      color,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lesson ID is required',
        },
        { status: 400 }
      );
    }

    // Validation
    if (!lessonName || !Array.isArray(subjectIds) || !Array.isArray(teacherIds) || !Array.isArray(classIds)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lesson name, subjects, teachers, and classes are required',
        },
        { status: 400 }
      );
    }

    if (subjectIds.length === 0 || teacherIds.length === 0 || classIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one subject, teacher, and class must be selected',
        },
        { status: 400 }
      );
    }

    const lesson = await Lesson.findByIdAndUpdate(
      id,
      {
        lessonName,
        subjectIds,
        teacherIds,
        classIds,
        periodsPerWeek: periodsPerWeek || 1,
        isDoublePeriod: isDoublePeriod || false,
        color: color || '#3B82F6',
        notes: notes || '',
      },
      { new: true, runValidators: true }
    )
      .populate('subjectIds', 'name code category')
      .populate('teacherIds', 'name email')
      .populate('classIds', 'name gradeLevel');

    if (!lesson) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lesson not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: lesson,
      message: 'Lesson updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating lesson:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update lesson',
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a lesson
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lesson ID is required',
        },
        { status: 400 }
      );
    }

    const lesson = await Lesson.findByIdAndDelete(id);

    if (!lesson) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lesson not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Lesson deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting lesson:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete lesson',
      },
      { status: 500 }
    );
  }
}
