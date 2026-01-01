import mongoose, { Document, Schema } from 'mongoose';

export interface ISubject extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  color: string;
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
    color: {
      type: String,
      required: [true, 'Subject color is required'],
      default: '#3B82F6',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for multi-tenant queries
SubjectSchema.index({ schoolId: 1, name: 1 }, { unique: true });

// Note: If you encounter "E11000 duplicate key error" for schoolId_1_code_1,
// it's an old index. Drop it using: db.subjects.dropIndex("schoolId_1_code_1")

export default mongoose.models.Subject || mongoose.model<ISubject>('Subject', SubjectSchema);
