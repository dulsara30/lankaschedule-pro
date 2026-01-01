import mongoose, { Document, Schema } from 'mongoose';

export interface IClass extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string; // e.g., "6-A", "12-Maths-Olu"
  gradeLevel: number; // 1-13 for Sri Lankan schools
  stream?: string; // e.g., "Science", "Arts", "Commerce" (for higher grades)
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
    gradeLevel: {
      type: Number,
      required: [true, 'Grade level is required'],
      min: [1, 'Grade level must be between 1 and 13'],
      max: [13, 'Grade level must be between 1 and 13'],
    },
    stream: {
      type: String,
      trim: true,
      enum: ['Science', 'Arts', 'Commerce', 'Technology', ''],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for multi-tenant queries
ClassSchema.index({ schoolId: 1, name: 1 }, { unique: true });
ClassSchema.index({ schoolId: 1, gradeLevel: 1 });

export default mongoose.models.Class || mongoose.model<IClass>('Class', ClassSchema);
