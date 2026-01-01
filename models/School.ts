import mongoose, { Document, Schema } from 'mongoose';

export interface ISchoolConfig {
  startTime: string; // e.g., "07:30"
  periodDuration: number; // in minutes, e.g., 50
  numberOfPeriods: number; // e.g., 7
  intervalSlots: {
    afterPeriod: number; // e.g., 2 (interval after 2nd period)
    duration: number; // in minutes, e.g., 15
  }[];
}

export interface ISchool extends Document {
  name: string;
  address: string;
  config: ISchoolConfig;
  createdAt: Date;
  updatedAt: Date;
}

const SchoolConfigSchema = new Schema<ISchoolConfig>(
  {
    startTime: {
      type: String,
      required: true,
      default: '07:30',
    },
    periodDuration: {
      type: Number,
      required: true,
      default: 50,
    },
    numberOfPeriods: {
      type: Number,
      required: true,
      default: 7,
    },
    intervalSlots: [
      {
        afterPeriod: {
          type: Number,
          required: true,
        },
        duration: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  { _id: false }
);

const SchoolSchema = new Schema<ISchool>(
  {
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'School address is required'],
      trim: true,
    },
    config: {
      type: SchoolConfigSchema,
      required: true,
      default: () => ({
        startTime: '07:30',
        periodDuration: 50,
        numberOfPeriods: 7,
        intervalSlots: [
          { afterPeriod: 2, duration: 15 }, // Short break after 2nd period
          { afterPeriod: 4, duration: 30 }, // Lunch after 4th period
        ],
      }),
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SchoolSchema.index({ name: 1 });

export default mongoose.models.School || mongoose.model<ISchool>('School', SchoolSchema);
