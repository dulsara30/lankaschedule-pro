// Type definitions for MongoDB ObjectIds and common types

import { Types } from 'mongoose';

export type ObjectId = Types.ObjectId;

export interface MultiTenantQuery {
  schoolId: ObjectId | string;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

export interface TimeSlot {
  day: DayOfWeek;
  periodNumber: number;
}

export interface PeriodTime {
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}
