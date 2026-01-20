/**
 * Test results tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const getJobTestsSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
  job_id: z.string().describe('GitHub Actions job ID'),
  status: z
    .enum(['pass', 'fail', 'skip'])
    .optional()
    .describe('Filter by test status'),
});

export const getFailedTestsSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
  job_id: z.string().describe('GitHub Actions job ID'),
});

export async function getJobTests(
  client: BlacksmithClient,
  args: z.infer<typeof getJobTestsSchema>
) {
  const response = await client.getJobTests(args.run_id, args.job_id, args.status);

  // Group tests by suite for better readability
  const suites = new Map<string, typeof response.tests>();
  for (const test of response.tests) {
    const suite = test.test_suite || 'Unknown Suite';
    const existing = suites.get(suite) ?? [];
    existing.push(test);
    suites.set(suite, existing);
  }

  // Calculate summary stats
  const stats = {
    total: response.total_count,
    passed: response.tests.filter((t) => t.test_status === 'pass').length,
    failed: response.tests.filter((t) => t.test_status === 'fail').length,
    skipped: response.tests.filter((t) => t.test_status === 'skip').length,
  };

  return {
    summary: stats,
    suites: Array.from(suites.entries()).map(([name, tests]) => ({
      name,
      test_count: tests.length,
      tests: tests.map((t) => ({
        id: t.id,
        name: t.test_name,
        status: t.test_status,
        duration_seconds: t.duration_seconds,
        logs: t.logs,
      })),
    })),
  };
}

export async function getFailedTests(
  client: BlacksmithClient,
  args: z.infer<typeof getFailedTestsSchema>
) {
  const response = await client.getJobTests(args.run_id, args.job_id, 'fail');

  return {
    failed_count: response.total_count,
    tests: response.tests.map((t) => ({
      id: t.id,
      name: t.test_name,
      suite: t.test_suite,
      duration_seconds: t.duration_seconds,
      error: t.logs,
      commit: {
        sha: t.sha.substring(0, 7),
        message: t.commit_message,
        branch: t.branch,
        pr_number: t.pr_number,
      },
    })),
  };
}
