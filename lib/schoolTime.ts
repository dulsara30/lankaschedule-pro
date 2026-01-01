import { ISchoolConfig } from '@/models/School';

/**
 * Calculate the school end time based on start time, periods, and intervals
 * @param config School configuration object
 * @returns End time in HH:MM format
 */
export function calculateSchoolEndTime(config: ISchoolConfig): string {
  const { startTime, periodDuration, numberOfPeriods, intervalSlots } = config;

  // Parse start time (format: "07:30")
  const [startHour, startMinute] = startTime.split(':').map(Number);
  let totalMinutes = startHour * 60 + startMinute;

  // Add all period durations
  totalMinutes += numberOfPeriods * periodDuration;

  // Add all interval durations
  if (intervalSlots && intervalSlots.length > 0) {
    const totalIntervalTime = intervalSlots.reduce(
      (sum, interval) => sum + interval.duration,
      0
    );
    totalMinutes += totalIntervalTime;
  }

  // Convert back to hours and minutes
  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;

  // Format as HH:MM
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

/**
 * Get the time when a specific period ends
 * @param config School configuration
 * @param periodNumber Period number (1-based)
 * @returns End time for the specified period in HH:MM format
 */
export function getPeriodEndTime(config: ISchoolConfig, periodNumber: number): string {
  const { startTime, periodDuration, intervalSlots } = config;

  // Parse start time
  const [startHour, startMinute] = startTime.split(':').map(Number);
  let totalMinutes = startHour * 60 + startMinute;

  // Add time for completed periods
  totalMinutes += periodNumber * periodDuration;

  // Add intervals that occur before this period ends
  if (intervalSlots && intervalSlots.length > 0) {
    for (const interval of intervalSlots) {
      if (interval.afterPeriod < periodNumber) {
        totalMinutes += interval.duration;
      }
    }
  }

  // Convert to HH:MM
  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;

  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

/**
 * Get the start time of a specific period
 * @param config School configuration
 * @param periodNumber Period number (1-based)
 * @returns Start time for the specified period in HH:MM format
 */
export function getPeriodStartTime(config: ISchoolConfig, periodNumber: number): string {
  if (periodNumber === 1) {
    return config.startTime;
  }

  const { startTime, periodDuration, intervalSlots } = config;

  // Parse start time
  const [startHour, startMinute] = startTime.split(':').map(Number);
  let totalMinutes = startHour * 60 + startMinute;

  // Add time for completed periods
  totalMinutes += (periodNumber - 1) * periodDuration;

  // Add intervals that occur before this period starts
  if (intervalSlots && intervalSlots.length > 0) {
    for (const interval of intervalSlots) {
      if (interval.afterPeriod < periodNumber) {
        totalMinutes += interval.duration;
      }
    }
  }

  // Convert to HH:MM
  const startHourCalc = Math.floor(totalMinutes / 60);
  const startMinuteCalc = totalMinutes % 60;

  return `${String(startHourCalc).padStart(2, '0')}:${String(startMinuteCalc).padStart(2, '0')}`;
}

/**
 * Generate a full day schedule showing all periods and intervals
 * @param config School configuration
 * @returns Array of schedule items with type, number, start and end times
 */
export function generateDaySchedule(config: ISchoolConfig): Array<{
  type: 'period' | 'interval';
  number?: number;
  startTime: string;
  endTime: string;
  duration: number;
}> {
  const schedule: Array<{
    type: 'period' | 'interval';
    number?: number;
    startTime: string;
    endTime: string;
    duration: number;
  }> = [];

  for (let i = 1; i <= config.numberOfPeriods; i++) {
    const startTime = getPeriodStartTime(config, i);
    const endTime = getPeriodEndTime(config, i);

    schedule.push({
      type: 'period',
      number: i,
      startTime,
      endTime,
      duration: config.periodDuration,
    });

    // Check if there's an interval after this period
    const interval = config.intervalSlots?.find((slot) => slot.afterPeriod === i);
    if (interval) {
      const intervalStart = endTime;
      const [hour, minute] = intervalStart.split(':').map(Number);
      const totalMinutes = hour * 60 + minute + interval.duration;
      const intervalEndHour = Math.floor(totalMinutes / 60);
      const intervalEndMinute = totalMinutes % 60;
      const intervalEnd = `${String(intervalEndHour).padStart(2, '0')}:${String(intervalEndMinute).padStart(2, '0')}`;

      schedule.push({
        type: 'interval',
        startTime: intervalStart,
        endTime: intervalEnd,
        duration: interval.duration,
      });
    }
  }

  return schedule;
}
