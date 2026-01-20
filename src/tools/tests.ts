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
  include_tests: z
    .boolean()
    .optional()
    .describe('Include individual test details (default: false, returns summary only)'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of tests to return when include_tests is true (default: 50)'),
});

export const getFailedTestsSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
  job_id: z.string().describe('GitHub Actions job ID'),
  suite: z
    .string()
    .optional()
    .describe('Filter by test suite name (e.g., "FeatureFlags Middleware")'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of failed tests to return (default: all)'),
});

export async function getJobTests(
  client: BlacksmithClient,
  args: z.infer<typeof getJobTestsSchema>
) {
  const response = await client.getJobTests(args.run_id, args.job_id, args.status);

  const tests = response.tests ?? [];
  const includeTests = args.include_tests ?? false;
  const limit = args.limit ?? 50;

  // Group tests by suite
  const suiteStats = new Map<string, { total: number; passed: number; failed: number; skipped: number }>();
  for (const test of tests) {
    const suite = test.test_suite || 'Unknown Suite';
    const existing = suiteStats.get(suite) ?? { total: 0, passed: 0, failed: 0, skipped: 0 };
    existing.total++;
    if (test.test_status === 'pass') existing.passed++;
    else if (test.test_status === 'fail') existing.failed++;
    else if (test.test_status === 'skip') existing.skipped++;
    suiteStats.set(suite, existing);
  }

  // Calculate overall summary stats
  const summary = {
    total: response.total_count ?? tests.length,
    passed: tests.filter((t) => t.test_status === 'pass').length,
    failed: tests.filter((t) => t.test_status === 'fail').length,
    skipped: tests.filter((t) => t.test_status === 'skip').length,
  };

  // Build suite breakdown - only suites with failures, limited to top 15
  const suitesWithFailures = Array.from(suiteStats.entries())
    .filter(([, stats]) => stats.failed > 0)
    .sort((a, b) => b[1].failed - a[1].failed)
    .slice(0, 15)
    .map(([name, stats]) => ({
      name,
      failed: stats.failed,
      passed: stats.passed,
    }));

  // Return summary only by default
  if (!includeTests) {
    return {
      summary,
      failing_suites: suitesWithFailures,
      total_suites: suiteStats.size,
    };
  }

  // Include individual tests when requested (limited)
  const limitedTests = tests.slice(0, limit).map((t) => ({
    name: t.test_name,
    suite: t.test_suite,
    status: t.test_status,
  }));

  return {
    summary,
    failing_suites: suitesWithFailures,
    tests: limitedTests,
    showing: `${Math.min(tests.length, limit)} of ${tests.length}`,
  };
}

export async function getFailedTests(
  client: BlacksmithClient,
  args: z.infer<typeof getFailedTestsSchema>
) {
  const response = await client.getJobTests(args.run_id, args.job_id, 'fail');

  let tests = response.tests ?? [];

  // Filter by suite if specified
  if (args.suite) {
    const suiteFilter = args.suite.toLowerCase();
    tests = tests.filter(t =>
      t.test_suite?.toLowerCase().includes(suiteFilter)
    );
  }

  // Default to 20 failed tests to avoid filling context
  const limit = args.limit ?? 20;
  const limitedTests = tests.slice(0, limit);

  // Group by test suite for easier debugging
  const bySuite = new Map<string, typeof limitedTests>();
  for (const test of limitedTests) {
    const suite = test.test_suite || 'Unknown Suite';
    const existing = bySuite.get(suite) ?? [];
    existing.push(test);
    bySuite.set(suite, existing);
  }

  return {
    summary: {
      total_failed: response.total_count ?? (response.tests?.length ?? 0),
      filtered: args.suite ? tests.length : undefined,
      showing: limitedTests.length,
      suites_affected: bySuite.size,
    },
    by_suite: Array.from(bySuite.entries()).map(([suite, suiteTests]) => ({
      suite,
      failed_count: suiteTests.length,
      tests: suiteTests.map((t) => ({
        name: t.test_name,
        file: extractFilePath(t.logs),
        error: truncateError(t.logs, 3), // First 3 lines of error
      })),
    })),
    commit: limitedTests[0] ? {
      sha: limitedTests[0].sha?.substring(0, 7),
      branch: limitedTests[0].branch,
      pr_number: limitedTests[0].pr_number,
    } : null,
  };
}

/**
 * Extract file path from error logs.
 */
function extractFilePath(logs: string | null): string | null {
  if (!logs) return null;
  // Match common test file path patterns
  const match = logs.match(/at (?:Object\.)?[^\s]+\s+\(([^:]+):\d+:\d+\)/);
  return match ? match[1] : null;
}

/**
 * Truncate error to first N meaningful lines.
 */
function truncateError(logs: string | null, maxLines: number): string | null {
  if (!logs) return null;
  const lines = logs.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('at ')) // Skip stack trace lines
    .slice(0, maxLines);
  return lines.join(' | ');
}
