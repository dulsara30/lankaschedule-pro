import mongoose, { Document, Schema } from 'mongoose';

/**
 * TIMETABLE SLOT MODEL
 * 
 * Represents a specific time slot in the weekly timetable.
 * Each slot links a class to a lesson at a specific day and period.
 * 
 * Example:
 * - classId: 6-A
 * - lessonId: "Grade 6 Aesthetic Arts"
 * - day: "Monday"
 * - periodNumber: 3
 * 
 * This means: On Monday, during period 3, class 6-A has "Grade 6 Aesthetic Arts"
 */

export interface ITimetableSlot extends Document {
  schoolId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId; // The class this slot belongs to
  lessonId: mongoose.Types.ObjectId; // The lesson assigned to this slot
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  periodNumber: number; // 1-7 (or as configured in school settings)
  isDoubleStart?: boolean; // TRUE if this is the first period of a double block
  isDoubleEnd?: boolean; // TRUE if this is the second period of a double block
  weekNumber?: number; // Optional: for schools with rotating schedules
  academicYear?: string; // e.g., "2026"
  term?: string; // e.g., "Term 1", "Term 2", "Term 3"
  isLocked?: boolean; // Prevent auto-generation from modifying this slot
  createdAt: Date;
  updatedAt: Date;
}

const TimetableSlotSchema = new Schema<ITimetableSlot>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class ID is required'],
      index: true,
    },
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: 'Lesson',
      required: [true, 'Lesson ID is required'],
      index: true,
    },
    day: {
      type: String,
      required: [true, 'Day is required'],
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    },
    periodNumber: {
      type: Number,
      required: [true, 'Period number is required'],
      min: [1, 'Period number must be at least 1'],
    },
    isDoubleStart: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDoubleEnd: {
      type: Boolean,
      default: false,
      index: true,
    },
    weekNumber: {
      type: Number,
      min: [1, 'Week number must be at least 1'],
      default: 1,
    },
    academicYear: {
      type: String,
      default: () => new Date().getFullYear().toString(),
    },
    term: {
      type: String,
      default: 'Term 1',
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries and constraints
// Ensure no duplicate slots for the same class on the same day/period
TimetableSlotSchema.index(
  { schoolId: 1, classId: 1, day: 1, periodNumber: 1, weekNumber: 1, academicYear: 1, term: 1 },
  { unique: true }
);

// Find all slots for a specific class
TimetableSlotSchema.index({ schoolId: 1, classId: 1, academicYear: 1, term: 1 });

// Find all slots for a specific lesson
TimetableSlotSchema.index({ schoolId: 1, lessonId: 1, academicYear: 1, term: 1 });

// Find all slots for a specific day
TimetableSlotSchema.index({ schoolId: 1, day: 1, periodNumber: 1 });

// Pre-save validation: Check if periodNumber is within school's configured range
TimetableSlotSchema.pre('save', async function () {
  const School = mongoose.model('School');
  const school = await School.findById(this.schoolId);
  
  if (!school) {
    throw new Error('School not found');
  }
  
  if (this.periodNumber > school.config.numberOfPeriods) {
    throw new Error(
      `Period number ${this.periodNumber} exceeds school's configured periods (${school.config.numberOfPeriods})`
    );
  }
});

export default mongoose.models.TimetableSlot ||
  mongoose.model<ITimetableSlot>('TimetableSlot', TimetableSlotSchema);
