import mongoose, { Document, Schema } from 'mongoose';

export interface IClass extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string; // e.g., "Grade 6", "6-A", "13 Years", "13Y-A"
  grade: number | string; // 1-13 for regular grades, '13-years' for 13 Years program
  stream?: string; // e.g., "Science", "Arts", "Commerce", "Technology" (for higher grades)
  classTeacher?: mongoose.Types.ObjectId; // Reference to Teacher
  createdAt: Date;
  updatedAt: Date;
}

const ClassSchema = new Schema<IClass>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
    },
    grade: {
      type: Schema.Types.Mixed,
      required: [true, 'Grade is required'],
    },
    stream: {
      type: String,
      trim: true,
      enum: ['Science', 'Arts', 'Commerce', 'Technology', ''],
      default: '',
    },
    classTeacher: {
      type: Schema.Types.ObjectId,
      ref: 'Teacher',
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for multi-tenant queries
ClassSchema.index({ schoolId: 1, name: 1 }, { unique: true });
ClassSchema.index({ schoolId: 1, grade: 1 });

export default mongoose.models.Class || mongoose.model<IClass>('Class', ClassSchema);
