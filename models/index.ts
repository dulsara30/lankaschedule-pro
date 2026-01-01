/**
 * Central export point for all Mongoose models
 * Import models from here to ensure proper initialization order
 */

export { default as School } from './School';
export { default as Teacher } from './Teacher';
export { default as Subject } from './Subject';
export { default as Class } from './Class';
export { default as Lesson } from './Lesson';
export { default as TimetableSlot } from './TimetableSlot';

// Re-export types
export type { ISchool, ISchoolConfig } from './School';
export type { ITeacher } from './Teacher';
export type { ISubject } from './Subject';
export type { IClass } from './Class';
export type { ILesson } from './Lesson';
export type { ITimetableSlot } from './TimetableSlot';
