import mongoose, { Document, Schema } from 'mongoose';

// Teacher workload constants for Sri Lankan schools
export const TEACHER_MIN_PERIODS = 24;
export const TEACHER_MAX_PERIODS = 35;

export interface ITeacher extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phoneNumber?: string;
  teacherGrade: 'SLTS 3 I' | 'SLTS 2 II' | 'SLTS 2 I' | 'SLTS 1' | 'DO';
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
      required: false,
      trim: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      required: false,
      trim: true,
    },
    teacherGrade: {
      type: String,
      enum: ['SLTS 3 I', 'SLTS 2 II', 'SLTS 2 I', 'SLTS 1', 'DO'],
      default: 'SLTS 3 I',
      required: [true, 'Teacher grade is required'],
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
TeacherSchema.index({ schoolId: 1, email: 1 }, { unique: true, sparse: true });
TeacherSchema.index({ schoolId: 1, name: 1 });
TeacherSchema.index({ schoolId: 1, teacherGrade: 1 });

// Pre-save validation: Either email or phoneNumber must be provided
TeacherSchema.pre('save', function (next) {
  if (!this.email && !this.phoneNumber) {
    return next(new Error('Either email or phoneNumber must be provided for a teacher'));
  }
  next();
});

export default mongoose.models.Teacher || mongoose.model<ITeacher>('Teacher', TeacherSchema);

