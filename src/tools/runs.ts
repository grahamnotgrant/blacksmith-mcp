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

export const listJobsSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
});

/**
 * Get default date range (last 7 days).
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  return { startDate, endDate };
}

export async function listRuns(
  client: BlacksmithClient,
  args: z.infer<typeof listRunsSchema>
) {
  // Use defaults if dates not provided
  const defaults = getDefaultDateRange();
  const startDate = args.start_date || defaults.startDate;
  const endDate = args.end_date || defaults.endDate;

  // API returns raw array of runs
  const runs = await client.listRuns({
    startDate,
    endDate,
    limit: args.limit,
  });

  return {
    runs: runs.map((run) => ({
      id: run.id,
      name: run.name,
      workflow_name: run.workflow_name,
      branch: run.branch_name || run.head_branch,
      sha: (run.head_commit?.sha || run.head_sha)?.substring(0, 7),
      status: run.status,
      conclusion: run.conclusion,
      event: run.event,
      repository: run.repository_name || run.repository?.full_name,
      actor: run.actor?.login,
      duration_seconds: run.duration_seconds,
      created_at: run.created_at,
      github_url: run.github_url,
    })),
    total_count: runs.length,
    date_range: { start: startDate, end: endDate },
  };
}

export async function getRun(
  client: BlacksmithClient,
  args: z.infer<typeof getRunSchema>
) {
  const run = await client.getRun(args.run_id);

  return {
    run_id: run.run_id,
    workflow_name: run.workflow_name,
    repository: run.repository_name,
    attempts: run.attempts?.map((a) => ({
      attempt: a.attempt,
      status: a.status,
      event: a.event,
      created_at: a.created_at,
      github_url: a.html_url,
    })),
    jobs: run.jobs?.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      runtime_seconds: job.runtime_seconds,
      labels: job.labels,
    })),
    job_count: run.jobs?.length ?? 0,
  };
}

export async function listJobs(
  client: BlacksmithClient,
  args: z.infer<typeof listJobsSchema>
) {
  const run = await client.getRun(args.run_id);

  return {
    run_id: run.run_id,
    workflow_name: run.workflow_name,
    repository: run.repository_name,
    jobs: run.jobs?.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      runtime_seconds: job.runtime_seconds,
      labels: job.labels,
      steps: job.steps?.map((s) => ({
        number: s.number,
        name: s.name,
        status: s.status,
        conclusion: s.conclusion,
      })),
    })) ?? [],
    total_count: run.jobs?.length ?? 0,
  };
}
