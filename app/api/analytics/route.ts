import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import TimetableVersion from '@/models/TimetableVersion';
import TimetableSlot from '@/models/TimetableSlot';
import Teacher from '@/models/Teacher';
import Subject from '@/models/Subject';
import Class from '@/models/Class';
import Lesson from '@/models/Lesson';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const versionIdParam = searchParams.get('versionId');

    let versionId = versionIdParam;

    // If no versionId specified, get the latest version (draft first, then most recent saved)
    if (!versionId) {
      const latestDraft = await TimetableVersion.findOne({ isSaved: false }).sort({ createdAt: -1 });
      if (latestDraft) {
        versionId = latestDraft._id.toString();
      } else {
        const latestSaved = await TimetableVersion.findOne({ isSaved: true }).sort({ createdAt: -1 });
        if (latestSaved) {
          versionId = latestSaved._id.toString();
        }
      }
    }

    // If still no version, return empty analytics
    if (!versionId) {
      return NextResponse.json({
        success: true,
        data: {
          versionId: null,
          teacherWorkload: [],
          subjectCoverage: [],
          classReadiness: [],
          stats: {
            totalTeachers: 0,
            totalClasses: 0,
            scheduledEfficiency: 0,
            totalSlots: 0,
          },
        },
      });
    }

    // Fetch all data in parallel
    const slots = await TimetableSlot.find({ versionId })
      .populate('classId')
      .populate({
        path: 'lessonId',
        populate: [
          { path: 'subjectIds' },
          { path: 'teacherIds' },
        ],
      })
      .lean();

    // Get schoolId from first slot for data scoping
    const schoolId = slots[0]?.schoolId;
    if (!schoolId) {
      return NextResponse.json({
        teacherWorkload: [],
        subjectDistribution: [],
        classSchedules: [],
        versionComparison: [],
      });
    }

    const [teachers, subjects, classes, lessons, versions] = await Promise.all([
      Teacher.find({ schoolId }).lean(),
      Subject.find({ schoolId }).lean(),
      Class.find({ schoolId }).lean(),
      Lesson.find({ schoolId })
        .populate('subjectIds')
        .populate('teacherIds')
        .populate('classIds')
        .lean(),
      TimetableVersion.find({ schoolId }).lean(),
    ]);

    // 1. Teacher Workload Distribution
    const teacherWorkloadMap = new Map<string, { name: string; periods: number; email: string }>();
    
    teachers.forEach((teacher) => {
      teacherWorkloadMap.set(teacher._id.toString(), {
        name: teacher.name,
        periods: 0,
        email: teacher.email,
      });
    });

    slots.forEach((slot) => {
      if (slot.lessonId && typeof slot.lessonId === 'object' && 'teacherIds' in slot.lessonId) {
        const lesson = slot.lessonId as any;
        if (lesson.teacherIds) {
          lesson.teacherIds.forEach((teacher: any) => {
            const teacherId = teacher._id.toString();
            const current = teacherWorkloadMap.get(teacherId);
            if (current) {
              current.periods += 1;
            }
          });
        }
      }
    });

    const teacherWorkload = Array.from(teacherWorkloadMap.values())
      .map((teacher) => ({
        ...teacher,
        status: teacher.periods < 24 ? 'underloaded' : teacher.periods > 35 ? 'overloaded' : 'optimal',
      }))
      .sort((a, b) => b.periods - a.periods);

    // 2. Subject Coverage Summary
    const subjectCoverageMap = new Map<string, { name: string; periods: number; color: string }>();
    
    subjects.forEach((subject) => {
      subjectCoverageMap.set(subject._id.toString(), {
        name: subject.name,
        periods: 0,
        color: subject.color,
      });
    });

    slots.forEach((slot) => {
      if (slot.lessonId && typeof slot.lessonId === 'object' && 'subjectIds' in slot.lessonId) {
        const lesson = slot.lessonId as any;
        if (lesson.subjectIds) {
          lesson.subjectIds.forEach((subject: any) => {
            const subjectId = subject._id.toString();
            const current = subjectCoverageMap.get(subjectId);
            if (current) {
              current.periods += 1;
            }
          });
        }
      }
    });

    const subjectCoverage = Array.from(subjectCoverageMap.values())
      .filter((subject) => subject.periods > 0)
      .sort((a, b) => b.periods - a.periods);

    // 3. Class Readiness Tracker
    const classReadinessMap = new Map<string, { name: string; grade: number | string; assigned: number; target: number }>();
    
    classes.forEach((classItem) => {
      classReadinessMap.set(classItem._id.toString(), {
        name: classItem.name,
        grade: classItem.grade,
        assigned: 0,
        target: 35, // Default target, could be customized per class
      });
    });

    slots.forEach((slot) => {
      if (slot.classId) {
        const classId = slot.classId._id.toString();
        const current = classReadinessMap.get(classId);
        if (current) {
          current.assigned += 1;
        }
      }
    });

    const classReadiness = Array.from(classReadinessMap.values())
      .map((classItem) => ({
        ...classItem,
        percentage: Math.round((classItem.assigned / classItem.target) * 100),
      }))
      .sort((a, b) => {
        // Sort by grade first, then by name
        if (a.grade !== b.grade) {
          return Number(a.grade) - Number(b.grade);
        }
        return a.name.localeCompare(b.name);
      });

    // 4. Calculate Stats
    // Calculate total possible slots from lessons
    const totalLessonPeriods = lessons.reduce((sum, lesson) => {
      const periodsPerWeek = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
      return sum + periodsPerWeek;
    }, 0);

    // Count unique slots (since double periods create 2 slots but count as 1 unit)
    const uniqueSlotCount = slots.filter(slot => !slot.isDoubleEnd).length;

    const scheduledEfficiency = totalLessonPeriods > 0 
      ? Math.round((uniqueSlotCount / totalLessonPeriods) * 100)
      : 0;

    const stats = {
      totalTeachers: teachers.length,
      totalClasses: classes.length,
      scheduledEfficiency,
      totalSlots: slots.length,
      totalVersions: versions.length,
    };

    return NextResponse.json({
      success: true,
      data: {
        versionId,
        teacherWorkload,
        subjectCoverage,
        classReadiness,
        stats,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
