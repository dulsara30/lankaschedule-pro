import mongoose, { Document, Schema } from 'mongoose';

export interface ISubject extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  code: string; // e.g., "MATH", "SCI", "ART"
  category: string; // e.g., "Core", "Aesthetic", "Optional"
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      required: [true, 'Subject category is required'],
      trim: true,
      enum: ['Core', 'Aesthetic', 'Optional', 'Extra-Curricular'],
      default: 'Core',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for multi-tenant queries
SubjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
SubjectSchema.index({ schoolId: 1, category: 1 });

export default mongoose.models.Subject || mongoose.model<ISubject>('Subject', SubjectSchema);
