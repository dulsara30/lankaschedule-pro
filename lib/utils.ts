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
 * Professional color palette with 50+ high-contrast colors
 * Designed for readability and visual distinction
 */
const PROFESSIONAL_COLORS = [
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
  '#3A86FF', // Bright Blue
  '#8338EC', // Electric Purple
  '#FB5607', // Vivid Orange
  '#FFBE0B', // Sunshine Yellow
  '#FF006E', // Hot Pink
  '#8AC926', // Bright Lime
  '#1982C4', // Ocean Blue
  '#6A4C93', // Royal Purple
  '#F15BB5', // Flamingo
  '#00BBF9', // Sky Blue
  '#00F5FF', // Aqua
  '#9B5DE5', // Amethyst
  '#F15BB5', // Rose
  '#FEE440', // Lemon
  '#00BBF9', // Azure
  '#F72585', // Ruby
  '#4361EE', // Cobalt
  '#3F37C9', // Sapphire
  '#4895EF', // Cerulean
  '#4CC9F0', // Electric Blue
  '#7209B7', // Deep Purple
  '#B5179E', // Orchid
  '#F72585', // Fuchsia
  '#560BAD', // Indigo
  '#480CA8', // Dark Purple
  '#3A0CA3', // Royal Blue
  '#3F37C9', // Periwinkle
  '#4361EE', // Cornflower
  '#4895EF', // Light Blue
  '#4CC9F0', // Cyan Blue
  '#06FFA5', // Spring Green
  '#72DDF7', // Baby Blue
  '#FFD23F', // Marigold
  '#EE6055', // Coral
  '#60D394', // Emerald
  '#AAF683', // Mint Green
  '#FFD97D', // Peach
  '#FF9B85', // Salmon
];

/**
 * Get an unused color for a new subject
 * @param usedColors Array of colors already assigned to subjects
 * @returns A unique color from the professional palette
 */
export function getUniqueColor(usedColors: string[]): string {
  // Filter out used colors
  const availableColors = PROFESSIONAL_COLORS.filter(
    color => !usedColors.includes(color)
  );

  // If all colors are used, return a random one from the full palette
  if (availableColors.length === 0) {
    return PROFESSIONAL_COLORS[Math.floor(Math.random() * PROFESSIONAL_COLORS.length)];
  }

  // Return a random available color
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}

/**
 * Generate a random bright/pastel color for subjects
 * @deprecated Use getUniqueColor instead for unique color assignment
 * @returns Hex color code (e.g., "#FF6B9D")
 */
export function generateBrightColor(): string {
  return PROFESSIONAL_COLORS[Math.floor(Math.random() * PROFESSIONAL_COLORS.length)];
}

