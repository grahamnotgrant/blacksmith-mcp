/**
 * Shared date utilities.
 */

/**
 * Get a default date range ending today.
 * @param days Number of days to look back (default: 7)
 */
export function getDefaultDateRange(days = 7): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0] ?? '';
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0] ?? '';
  return { startDate, endDate };
}
