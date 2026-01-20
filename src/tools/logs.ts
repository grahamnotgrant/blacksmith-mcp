/**
 * Log search tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const searchLogsSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('Search query (e.g., "error", "timeout", "failed"). Leave empty to get all logs.'),
  hours: z
    .number()
    .optional()
    .describe('Number of hours to search back (default: 1, max: 24)'),
  level: z
    .enum(['INFO', 'WARN', 'ERROR', 'DEBUG'])
    .optional()
    .describe('Filter by log level'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of logs to return (default: 100)'),
});

export async function searchLogs(
  client: BlacksmithClient,
  args: z.infer<typeof searchLogsSchema>
) {
  const hours = Math.min(args.hours ?? 1, 24);
  const limit = args.limit ?? 100;

  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const response = await client.searchLogs({
    startTime,
    endTime,
    query: args.query,
  });

  let logs = response.logs ?? [];

  // Filter by level if specified
  if (args.level) {
    logs = logs.filter(log => log.level.toUpperCase() === args.level);
  }

  // Apply limit
  const limitedLogs = logs.slice(0, limit);

  // Group by level for summary
  const levelCounts = new Map<string, number>();
  for (const log of logs) {
    const level = log.level.toUpperCase();
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }

  return {
    summary: {
      total_found: response.total_count ?? logs.length,
      showing: limitedLogs.length,
      time_range: { start: startTime, end: endTime },
      by_level: Object.fromEntries(levelCounts),
    },
    logs: limitedLogs.map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message.length > 200 ? log.message.substring(0, 200) + '...' : log.message,
      job_id: log.job_id,
      step: log.step_name,
    })),
    insight: levelCounts.get('ERROR')
      ? `Found ${levelCounts.get('ERROR')} error(s) in the last ${hours} hour(s).`
      : `No errors found in the last ${hours} hour(s).`,
  };
}
