/**
 * Format time in seconds to MM:SS
 */
export const formatTime = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format pace in seconds per mile to MM:SS/mi
 */
export const formatPace = (paceInSeconds: number | null | undefined): string => {
  if (paceInSeconds === null || paceInSeconds === undefined) return '--:--/mi';
  const mins = Math.floor(paceInSeconds / 60);
  const secs = Math.floor(paceInSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
};

/**
 * Convert meters to miles
 */
export const metersToMiles = (meters: number): number => {
  return meters * 0.000621371;
};

/**
 * Convert meters per second to minutes per mile
 */
export const mpsToMinPerMile = (mps: number): number => {
  if (mps === 0) return 0;
  return (1 / (mps * 2.23694)) * 60; // Convert m/s to min/mile
};
