import mongoose, { Document, Schema } from 'mongoose';

// Teacher workload constants for Sri Lankan schools
export const TEACHER_MIN_PERIODS = 24;
export const TEACHER_MAX_PERIODS = 35;

export interface ITeacher extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  subjectsTaught: string[]; // Array of subject names
  createdAt: Date;
  updatedAt: Date;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Teacher name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Teacher email is required'],
      trim: true,
      lowercase: true,
    },
    subjectsTaught: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for multi-tenant queries
TeacherSchema.index({ schoolId: 1, email: 1 }, { unique: true });
TeacherSchema.index({ schoolId: 1, name: 1 });

export default mongoose.models.Teacher || mongoose.model<ITeacher>('Teacher', TeacherSchema);
