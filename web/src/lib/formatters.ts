/**
 * Format a time in seconds to a MM:SS.T format
 * @param timeInSeconds Time in seconds
 * @returns Formatted time string (e.g., "5:30.5")
 */
export function formatTime(timeInSeconds: number | null): string {
  if (timeInSeconds === null || isNaN(timeInSeconds)) return '-';
  
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  
  // Ensure seconds are padded with leading zero if needed
  return `${minutes}:${seconds.padStart(4, '0')}`;
}

/**
 * Format a pace in seconds per mile to a MM:SS format
 * @param paceInSeconds Pace in seconds per mile
 * @returns Formatted pace string (e.g., "6:45/mi")
 */
export function formatPace(paceInSeconds: number | null): string {
  if (paceInSeconds === null || isNaN(paceInSeconds)) return '-';
  
  const minutes = Math.floor(paceInSeconds / 60);
  const seconds = Math.floor(paceInSeconds % 60);
  
  // Ensure seconds are padded with leading zero if needed
  return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
}
