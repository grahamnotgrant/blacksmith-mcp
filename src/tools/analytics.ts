/**
 * Analytics tools — job-level insights, breakdowns, and duration analysis.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';
import { getDefaultDateRange } from '../utils/dates.js';

// ==================== Phase 3: Daily Jobs + Summary ====================

export const getJobsDailySchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
});

export async function getJobsDaily(
  client: BlacksmithClient,
  args: z.infer<typeof getJobsDailySchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const data = await client.getJobsDaily(startDate, endDate);

  return {
    date_range: { start: startDate, end: endDate },
    data,
    insight: 'Daily job metrics showing counts, durations, and failure rates per day.',
  };
}

export const getJobsSummarySchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
});

export async function getJobsSummary(
  client: BlacksmithClient,
  args: z.infer<typeof getJobsSummarySchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const data = await client.getJobsStandalone(startDate, endDate);

  return {
    date_range: { start: startDate, end: endDate },
    summary: data,
    insight: 'Aggregate job statistics for the period (total jobs, duration, failure rate).',
  };
}

// ==================== Phase 4: Split Graph + Filtering ====================

export const getJobsByDimensionSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
  dimension: z
    .enum(['repository', 'workflow', 'branch', 'runner_type'])
    .optional()
    .describe('Dimension to break down by. Defaults to repository.'),
  metric: z
    .enum(['jobs', 'duration', 'failures'])
    .optional()
    .describe('Metric to measure. Defaults to jobs.'),
  top_n: z.number().optional().describe('Number of top results to return. Defaults to 20.'),
});

export async function getJobsByDimension(
  client: BlacksmithClient,
  args: z.infer<typeof getJobsByDimensionSchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const data = await client.getJobsSplitGraph({
    startDate,
    endDate,
    dimension: args.dimension ?? 'repository',
    metric: args.metric ?? 'jobs',
    topN: args.top_n ?? 20,
  });

  return {
    date_range: { start: startDate, end: endDate },
    dimension: args.dimension ?? 'repository',
    metric: args.metric ?? 'jobs',
    data,
    insight: `Job ${args.metric ?? 'jobs'} broken down by ${args.dimension ?? 'repository'}.`,
  };
}

export const getRunnerTypesSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
});

export async function getRunnerTypes(
  client: BlacksmithClient,
  args: z.infer<typeof getRunnerTypesSchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const data = await client.getJobsRunnerTypes(startDate, endDate);

  return {
    date_range: { start: startDate, end: endDate },
    runner_types: data,
    insight: 'Runner types used for CI jobs in this period.',
  };
}

export const getActiveRepositoriesSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
});

export async function getActiveRepositories(
  client: BlacksmithClient,
  args: z.infer<typeof getActiveRepositoriesSchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const data = await client.getJobsRepositories(startDate, endDate);

  return {
    date_range: { start: startDate, end: endDate },
    repositories: data,
    insight: 'Repositories with CI activity in this period.',
  };
}

export const getActiveBranchesSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
  repository: z.string().describe('Repository name (e.g. "Org/repo"). Required by the API.'),
});

export async function getActiveBranches(
  client: BlacksmithClient,
  args: z.infer<typeof getActiveBranchesSchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const data = await client.getJobsBranches(startDate, endDate, args.repository);

  return {
    date_range: { start: startDate, end: endDate },
    repository: args.repository,
    branches: data,
    insight: 'Branches with CI activity in this period.',
  };
}

// ==================== Phase 5: Duration Distribution ====================

export const getJobDurationDistributionSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
  bucket_count: z.number().optional().describe('Number of histogram buckets. Defaults to 50.'),
});

export async function getJobDurationDistribution(
  client: BlacksmithClient,
  args: z.infer<typeof getJobDurationDistributionSchema>
) {
  const defaults = getDefaultDateRange();
  const startDate = args.start_date ?? defaults.startDate;
  const endDate = args.end_date ?? defaults.endDate;

  const [histogram, exemplars] = await Promise.all([
    client.getJobDurationHistogram(startDate, endDate, args.bucket_count ?? 50),
    client.getJobDurationExemplars(startDate, endDate),
  ]);

  return {
    date_range: { start: startDate, end: endDate },
    histogram,
    percentiles: exemplars,
    insight: 'Job duration distribution with P50/P90/P95/P99/Max percentile breakdowns.',
  };
}
