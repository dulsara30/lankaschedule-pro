import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import School from '@/models/School';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'teacher') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!session.user.schoolId) {
      return NextResponse.json(
        { success: false, error: 'No school associated with this account' },
        { status: 400 }
      );
    }

    await dbConnect();

    // SECURITY: Only fetch school info for the teacher's school
    const school = await School.findById(session.user.schoolId).lean();

    if (!school) {
      return NextResponse.json(
        { success: false, error: 'School not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      school: {
        name: school.name,
        startTime: school.startTime,
        periodDuration: school.periodDuration,
        numberOfPeriods: school.numberOfPeriods,
      },
    });
  } catch (error) {
    console.error('Error fetching school info:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch school info' },
      { status: 500 }
    );
  }
}
