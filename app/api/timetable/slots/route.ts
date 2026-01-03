import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableSlot from '@/models/TimetableSlot';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const versionId = searchParams.get('versionId');

    let query: any = {};
    
    if (versionId) {
      query.versionId = versionId;
    }

    const slots = await TimetableSlot.find(query)
      .populate('classId')
      .populate({
        path: 'lessonId',
        populate: [
          { path: 'subjectIds' },
          { path: 'teacherIds' },
          { path: 'classIds' },
        ],
      })
      .lean();

    return NextResponse.json({
      success: true,
      slots,
    });
  } catch (error) {
    console.error('Error fetching slots:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
