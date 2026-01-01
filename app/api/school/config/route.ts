import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import School from '@/models/School';

// GET: Fetch school configuration
export async function GET() {
  try {
    await dbConnect();

    // For now, we'll use the first school (single-tenant for MVP)
    // Later we can add authentication and multi-tenant support
    const school = await School.findOne().lean();

    if (!school) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No school configuration found',
      });
    }

    return NextResponse.json({
      success: true,
      data: school,
    });
  } catch (error) {
    console.error('Error fetching school config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch school configuration',
      },
      { status: 500 }
    );
  }
}

// POST: Create or update school configuration
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { name, address, config } = body;

    // Validate required fields
    if (!name || !address || !config) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name, address, and config are required',
        },
        { status: 400 }
      );
    }

    // Validate config structure
    if (
      !config.startTime ||
      !config.periodDuration ||
      !config.numberOfPeriods ||
      !Array.isArray(config.intervalSlots)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid configuration structure',
        },
        { status: 400 }
      );
    }

    // For MVP, we'll update or create the first school
    let school = await School.findOne();

    if (school) {
      // Update existing school
      school.name = name;
      school.address = address;
      school.config = config;
      await school.save();
    } else {
      // Create new school
      school = await School.create({
        name,
        address,
        config,
      });
    }

    return NextResponse.json({
      success: true,
      data: school,
      message: 'School configuration saved successfully',
    });
  } catch (error) {
    console.error('Error saving school config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save school configuration',
      },
      { status: 500 }
    );
  }
}
