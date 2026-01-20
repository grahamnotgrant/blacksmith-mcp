/**
 * Job tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const getJobSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
  job_id: z.string().describe('GitHub Actions job ID'),
});

export const getJobLogsSchema = z.object({
  job_id: z.string().describe('GitHub Actions job ID'),
  limit: z.number().optional().describe('Maximum number of log lines (default: 1000)'),
  vm_id: z.string().optional().describe('VM ID for the job (optional)'),
});

export async function getJob(
  client: BlacksmithClient,
  args: z.infer<typeof getJobSchema>
) {
  const job = await client.getJob(args.run_id, args.job_id);

  return {
    id: job.id,
    run_id: job.run_id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    runner_name: job.runner_name,
    runner_group: job.runner_group_name,
    labels: job.labels,
    started_at: job.started_at,
    completed_at: job.completed_at,
    steps: job.steps.map((step) => ({
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      started_at: step.started_at,
      completed_at: step.completed_at,
    })),
  };
}

export async function getJobLogs(
  client: BlacksmithClient,
  args: z.infer<typeof getJobLogsSchema>
) {
  const logs = await client.getJobLogs(args.job_id, {
    limit: args.limit ?? 1000,
    vmId: args.vm_id,
  });

  // Return logs with some metadata
  const lines = logs.split('\n');
  return {
    job_id: args.job_id,
    line_count: lines.length,
    logs: logs,
  };
}
