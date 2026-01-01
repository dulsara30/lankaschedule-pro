import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface IntervalSlot {
  afterPeriod: number;
  duration: number;
}

/**
 * Calculate the school end time based on start time, periods, and intervals
 * @param startTime School start time in HH:MM format (e.g., "07:30")
 * @param numPeriods Total number of periods in the day
 * @param periodDuration Duration of each period in minutes
 * @param intervalSlots Array of interval slots with their durations
 * @returns End time in HH:MM format
 * 
 * Example: calculateEndTime("07:30", 7, 50, [{afterPeriod: 2, duration: 15}, {afterPeriod: 4, duration: 10}])
 * Start: 7:30 AM
 * + 7 periods × 50 minutes = 350 minutes
 * + 25 minutes (intervals) = 25 minutes
 * Total: 375 minutes = 6 hours 15 minutes
 * End: 7:30 + 6:15 = 13:45 (1:45 PM)
 */
export function calculateEndTime(
  startTime: string,
  numPeriods: number,
  periodDuration: number,
  intervalSlots: IntervalSlot[]
): string {
  // Parse start time (format: "07:30")
  const [startHour, startMinute] = startTime.split(':').map(Number);
  
  // Validate inputs
  if (isNaN(startHour) || isNaN(startMinute)) {
    throw new Error('Invalid start time format. Expected HH:MM');
  }
  
  if (numPeriods < 0 || periodDuration < 0) {
    throw new Error('Number of periods and period duration must be positive');
  }

  // Calculate total minutes from midnight for start time
  let totalMinutes = startHour * 60 + startMinute;

  // Add all period durations
  totalMinutes += numPeriods * periodDuration;

  // Add all interval durations
  if (intervalSlots && intervalSlots.length > 0) {
    const totalIntervalTime = intervalSlots.reduce(
      (sum, interval) => sum + (interval?.duration || 0),
      0
    );
    totalMinutes += totalIntervalTime;
  }

  // Convert back to hours and minutes
  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;

  // Format as HH:MM (24-hour format)
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

/**
 * Generate a random bright/pastel color for subjects
 * Uses HSL color space to ensure colors are vibrant and readable
 * @returns Hex color code (e.g., "#FF6B9D")
 */
export function generateBrightColor(): string {
  // Use a curated list of bright, pastel colors that work well with both light and dark backgrounds
  const brightPastelColors = [
    '#FF6B9D', // Pink
    '#C780E8', // Purple
    '#9D84B7', // Lavender
    '#6C91BF', // Blue
    '#51C4D3', // Cyan
    '#7AE7C7', // Mint
    '#5FD068', // Green
    '#B4E051', // Lime
    '#FFBE0B', // Yellow
    '#FB8500', // Orange
    '#FF6B6B', // Red
    '#4ECDC4', // Turquoise
    '#FFB6C1', // Light Pink
    '#DDA15E', // Tan
    '#BC6C25', // Brown
    '#8338EC', // Violet
    '#06FFA5', // Neon Green
    '#FFD60A', // Golden
    '#FF9E00', // Amber
    '#F72585', // Magenta
  ];

  // Return a random color from the curated list
  return brightPastelColors[Math.floor(Math.random() * brightPastelColors.length)];
}
