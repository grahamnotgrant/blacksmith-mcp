/**
 * Monitoring and alerting tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';
export const getMonitorsSchema = z.object({
  days: z.number().optional().describe('Number of days of timeline history (default: 30).'),
  limit: z.number().optional().describe('Maximum number of rules to return (default: 25).'),
});

export async function getMonitors(
  client: BlacksmithClient,
  args: z.infer<typeof getMonitorsSchema>
) {
  const endDate = new Date().toISOString().replace('Z', '.999Z');
  const startDate = new Date(
    Date.now() - (args.days ?? 30) * 24 * 60 * 60 * 1000
  ).toISOString().replace('Z', '.999Z');

  const data = await client.getMonitoringRules({
    timelineStartDate: startDate,
    timelineEndDate: endDate,
    limit: args.limit ?? 25,
  });

  return {
    monitors: data,
    insight: 'Alerting rules configured for this organization. Create and manage monitors in the Blacksmith dashboard.',
  };
}
