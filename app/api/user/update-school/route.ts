import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { User } from '@/models';
import dbConnect from '@/lib/dbConnect';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const { schoolId } = await request.json();

    if (!schoolId) {
      return NextResponse.json(
        { success: false, error: 'School ID required' },
        { status: 400 }
      );
    }

    // Update user's schoolId
    const user = await User.findByIdAndUpdate(
      session.user.id,
      { schoolId },
      { new: true }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        schoolId: user.schoolId,
      },
    });
  } catch (error) {
    console.error('Update school error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
