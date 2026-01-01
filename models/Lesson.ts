import mongoose, { Document, Schema } from 'mongoose';

/**
 * LESSON MODEL - The Core Scheduling Unit
 * 
 * A Lesson represents a single scheduling unit that can:
 * 1. Group multiple subjects (e.g., Art, Music, Dance for Aesthetic subjects)
 * 2. Assign multiple teachers (co-teaching or rotation)
 * 3. Cover multiple classes simultaneously (parallel classes like 6A, 6B, 6C)
 * 
 * Example Use Case:
 * Aesthetic subjects for Grade 6:
 * - lessonName: "Grade 6 Aesthetic Arts"
 * - subjectIds: [Art, Music, Dance]
 * - teacherIds: [Mr. Silva (Art), Ms. Perera (Music), Mr. Fernando (Dance)]
 * - classIds: [6-A, 6-B, 6-C]
 * - numberOfSingles: 2 (two single periods per week)
 * - numberOfDoubles: 1 (one double period per week)
 * 
 * This means: Each week, 6A, 6B, and 6C will have 2 single periods + 1 double period (total 4 period slots).
 * During these periods, students rotate through Art, Music, and Dance with their respective teachers.
 */

export interface ILesson extends Document {
  schoolId: mongoose.Types.ObjectId;
  lessonName: string; // Display name, e.g., "Grade 6 Aesthetic Arts" or "10-Maths"
  subjectIds: mongoose.Types.ObjectId[]; // Can be one or multiple subjects
  teacherIds: mongoose.Types.ObjectId[]; // Can be one or multiple teachers
  classIds: mongoose.Types.ObjectId[]; // Can be one or multiple classes (parallel teaching)
  numberOfSingles: number; // Number of single periods per week
  numberOfDoubles: number; // Number of double periods per week
  color?: string; // For UI visualization, e.g., "#3B82F6"
  notes?: string; // Additional information
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true,
    },
    lessonName: {
      type: String,
      required: [true, 'Lesson name is required'],
      trim: true,
    },
    subjectIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Subject',
      required: [true, 'At least one subject is required'],
      validate: {
        validator: function (v: mongoose.Types.ObjectId[]) {
          return v && v.length > 0;
        },
        message: 'At least one subject must be assigned to the lesson',
      },
    },
    teacherIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Teacher',
      required: [true, 'At least one teacher is required'],
      validate: {
        validator: function (v: mongoose.Types.ObjectId[]) {
          return v && v.length > 0;
        },
        message: 'At least one teacher must be assigned to the lesson',
      },
    },
    classIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Class',
      required: [true, 'At least one class is required'],
      validate: {
        validator: function (v: mongoose.Types.ObjectId[]) {
          return v && v.length > 0;
        },
        message: 'At least one class must be assigned to the lesson',
      },
    },
    numberOfSingles: {
      type: Number,
      required: [true, 'Number of single periods is required'],
      min: [0, 'Number of singles cannot be negative'],
      default: 0,
    },
    numberOfDoubles: {
      type: Number,
      required: [true, 'Number of double periods is required'],
      min: [0, 'Number of doubles cannot be negative'],
      default: 0,
    },
    color: {
      type: String,
      trim: true,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code (e.g., #3B82F6)'],
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient multi-tenant queries
LessonSchema.index({ schoolId: 1, lessonName: 1 });
LessonSchema.index({ schoolId: 1, teacherIds: 1 }); // Find all lessons for a teacher
LessonSchema.index({ schoolId: 1, classIds: 1 }); // Find all lessons for a class

// Validation: At least one single or double period must be specified
LessonSchema.pre('save', function () {
  if (this.numberOfSingles === 0 && this.numberOfDoubles === 0) {
    throw new Error('At least one single or double period must be specified per week');
  }
});

// Virtual field to calculate total period slots needed per week
LessonSchema.virtual('totalPeriodsNeeded').get(function () {
  return this.numberOfSingles + (this.numberOfDoubles * 2);
});

export default mongoose.models.Lesson || mongoose.model<ILesson>('Lesson', LessonSchema);
