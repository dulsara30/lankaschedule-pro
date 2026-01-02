import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// Teacher workload constants for Sri Lankan schools
export const TEACHER_MIN_PERIODS = 24;
export const TEACHER_MAX_PERIODS = 35;

export interface ITeacher extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phoneNumber?: string;
  password: string;
  teacherGrade: 'SLTS 3 I' | 'SLTS 2 II' | 'SLTS 2 I' | 'SLTS 1' | 'DO';
  subjectsTaught: string[]; // Array of subject names
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
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
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: true, // Include password in queries for authentication
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
TeacherSchema.pre('save', async function (next) {
  if (!this.email && !this.phoneNumber) {
    return next(new Error('Either email or phoneNumber must be provided for a teacher'));
  }
  
  // Hash password if modified
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error as Error);
    }
  }
  
  next();
});

// Method to compare passwords
TeacherSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.models.Teacher || mongoose.model<ITeacher>('Teacher', TeacherSchema);

