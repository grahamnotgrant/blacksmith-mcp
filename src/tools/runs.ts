/**
 * Workflow run tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const listRunsSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  limit: z.number().optional().describe('Maximum number of runs to return'),
});

export const getRunSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
});

export async function listRuns(
  client: BlacksmithClient,
  args: z.infer<typeof listRunsSchema>
) {
  const response = await client.listRuns({
    startDate: args.start_date,
    endDate: args.end_date,
    limit: args.limit,
  });

  return {
    runs: response.runs.map((run) => ({
      id: run.id,
      name: run.name,
      branch: run.head_branch,
      sha: run.head_sha.substring(0, 7),
      status: run.status,
      conclusion: run.conclusion,
      event: run.event,
      repository: run.repository.full_name,
      actor: run.actor.login,
      started_at: run.run_started_at,
    })),
    total_count: response.total_count,
  };
}

export async function getRun(
  client: BlacksmithClient,
  args: z.infer<typeof getRunSchema>
) {
  const run = await client.getRun(args.run_id);

  return {
    id: run.id,
    name: run.name,
    branch: run.head_branch,
    sha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    workflow_id: run.workflow_id,
    run_number: run.run_number,
    repository: run.repository.full_name,
    actor: run.actor.login,
    created_at: run.created_at,
    updated_at: run.updated_at,
    started_at: run.run_started_at,
    jobs_url: run.jobs_url,
  };
}
