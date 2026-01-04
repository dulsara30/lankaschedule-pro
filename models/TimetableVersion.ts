import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITimetableVersion extends Document {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  versionName: string;
  isSaved: boolean;
  isPublished: boolean;
  adminNote?: string;
  unplacedLessons?: any[]; // Array of lessons that couldn't be scheduled by the solver
  createdAt: Date;
  updatedAt: Date;
}

const TimetableVersionSchema = new Schema<ITimetableVersion>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    versionName: {
      type: String,
      required: true,
      trim: true,
    },
    isSaved: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    adminNote: {
      type: String,
      maxlength: [500, 'Admin note cannot exceed 500 characters'],
      trim: true,
    },
    unplacedLessons: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
TimetableVersionSchema.index({ schoolId: 1, isSaved: 1 });
TimetableVersionSchema.index({ schoolId: 1, createdAt: -1 });

const TimetableVersion =
  mongoose.models.TimetableVersion ||
  mongoose.model<ITimetableVersion>('TimetableVersion', TimetableVersionSchema);

export default TimetableVersion;
