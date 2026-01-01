import mongoose, { Document, Schema } from 'mongoose';

export interface ITeacher extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  subjectsTaught: string[]; // Array of subject names or IDs
  minPeriods: number;
  maxPeriods: number;
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
    minPeriods: {
      type: Number,
      default: 24,
      min: [0, 'Minimum periods cannot be negative'],
    },
    maxPeriods: {
      type: Number,
      default: 35,
      min: [0, 'Maximum periods cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for multi-tenant queries
TeacherSchema.index({ schoolId: 1, email: 1 }, { unique: true });
TeacherSchema.index({ schoolId: 1, name: 1 });

// Validation: maxPeriods should be >= minPeriods
TeacherSchema.pre('save', function () {
  if (this.maxPeriods < this.minPeriods) {
    throw new Error('Maximum periods must be greater than or equal to minimum periods');
  }
});

export default mongoose.models.Teacher || mongoose.model<ITeacher>('Teacher', TeacherSchema);
