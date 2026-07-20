/**
 * Format a time in seconds to a MM:SS.T format
 * @param timeInSeconds Time in seconds
 * @returns Formatted time string (e.g., "5:30.5")
 */
export function formatTime(timeInSeconds: number | null | undefined): string {
  if (timeInSeconds === null || timeInSeconds === undefined || isNaN(timeInSeconds) || timeInSeconds === 0) return '-';
  
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  
  // Ensure seconds are padded with leading zero if needed
  return `${minutes}:${seconds.padStart(4, '0')}`;
}

/**
 * Format a pace in seconds per mile to a MM:SS format
 * @param paceInSeconds Pace in seconds per mile
 * @returns Formatted pace string (e.g., "6:45")
 */
export function formatPace(paceInSeconds: number | null | undefined): string {
  if (paceInSeconds === null || paceInSeconds === undefined || isNaN(paceInSeconds) || paceInSeconds === 0) return '-';
  
  const minutes = Math.floor(paceInSeconds / 60);
  const seconds = Math.floor(paceInSeconds % 60);
  
  // Ensure seconds are padded with leading zero if needed
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format a distance in meters to miles with appropriate precision
 * @param distanceInMeters Distance in meters
 * @returns Formatted distance string (e.g., "3.1 mi")
 */
export function formatDistance(distanceInMeters: number | null | undefined): string {
  if (distanceInMeters === null || distanceInMeters === undefined || isNaN(distanceInMeters)) return '-';
  
  const miles = distanceInMeters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Format a percentage with appropriate precision
 * @param percentage Percentage value
 * @returns Formatted percentage string (e.g., "15.2%")
 */
export function formatPercentage(percentage: number | null | undefined): string {
  if (percentage === null || percentage === undefined || isNaN(percentage)) return '-';
  
  return `${percentage.toFixed(1)}%`;
}

/**
 * Format a date to a readable string
 * @param date Date object or string
 * @returns Formatted date string (e.g., "Oct 15, 2024")
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '-';
  
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format a number with appropriate precision
 * @param value Number value
 * @param precision Number of decimal places
 * @returns Formatted number string
 */
export function formatNumber(value: number | null | undefined, precision: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  
  return value.toFixed(precision);
}
