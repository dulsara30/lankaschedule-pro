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
  versionId: mongoose.Types.ObjectId; // Links to TimetableVersion
  classId: mongoose.Types.ObjectId; // The class this slot belongs to
  lessonId: mongoose.Types.ObjectId; // The lesson assigned to this slot
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | null; // null for unscheduled
  periodNumber: number | null; // null for unscheduled
  isDoubleStart?: boolean; // TRUE if this is the first period of a double block
  isDoubleEnd?: boolean; // TRUE if this is the second period of a double block
  isLocked?: boolean; // Prevent auto-generation from modifying this slot
  isUnscheduled?: boolean; // TRUE if this lesson could not be placed in the grid
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
    versionId: {
      type: Schema.Types.ObjectId,
      ref: 'TimetableVersion',
      required: true,
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
      required: false, // Allow null for unscheduled lessons
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', null],
      default: null,
    },
    periodNumber: {
      type: Number,
      required: false, // Allow null for unscheduled lessons
      min: [1, 'Period number must be at least 1'],
      default: null,
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
    isLocked: {
      type: Boolean,
      default: false,
    },
    isUnscheduled: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries and constraints
// Ensure no duplicate slots for the same class on the same day/period in a version
TimetableSlotSchema.index(
  { schoolId: 1, classId: 1, day: 1, periodNumber: 1, versionId: 1 },
  { unique: true }
);

// Find all slots for a specific class in a version
TimetableSlotSchema.index({ schoolId: 1, classId: 1, versionId: 1 });

// Find all slots for a specific lesson in a version
TimetableSlotSchema.index({ schoolId: 1, lessonId: 1, versionId: 1 });

// Find all slots for a specific day
TimetableSlotSchema.index({ schoolId: 1, day: 1, periodNumber: 1, versionId: 1 });

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

export default mongoose.models.TimetableSlot || mongoose.model<ITimetableSlot>('TimetableSlot', TimetableSlotSchema);
