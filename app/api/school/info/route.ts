import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { School } from '@/models';
import dbConnect from '@/lib/dbConnect';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user.schoolId) {
      return NextResponse.json(
        { success: false, error: 'No school configured' },
        { status: 400 }
      );
    }

    await dbConnect();

    const school = await School.findById(session.user.schoolId);

    if (!school) {
      return NextResponse.json(
        { success: false, error: 'School not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      school: {
        id: school._id,
        name: school.name,
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
