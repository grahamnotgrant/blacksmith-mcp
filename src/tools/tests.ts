/**
 * Test results tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';
import { isRunCompleted } from '../utils/runs.js';

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
  error_lines: z
    .number()
    .optional()
    .describe('Number of error lines to include per test (default: 5, max: 50)'),
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
  const totalFailed = response.total_count ?? tests.length;

  // Filter by suite if specified
  if (args.suite) {
    const suiteFilter = args.suite.toLowerCase();
    tests = tests.filter(t =>
      t.test_suite?.toLowerCase().includes(suiteFilter)
    );
  }

  // Apply limit only if specified (no default limit - return all)
  const limitedTests = args.limit ? tests.slice(0, args.limit) : tests;
  const errorLines = Math.min(args.error_lines ?? 5, 50);

  // Group by test suite for easier debugging
  const bySuite = new Map<string, typeof limitedTests>();
  for (const test of limitedTests) {
    const suite = test.test_suite || 'Unknown Suite';
    const existing = bySuite.get(suite) ?? [];
    existing.push(test);
    bySuite.set(suite, existing);
  }

  // Extract commit info once (same for all tests in a job)
  const firstTest = tests[0];

  return {
    summary: {
      total_failed: totalFailed,
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
        error: truncateError(t.logs, errorLines),
      })),
    })),
    commit: firstTest ? {
      sha: firstTest.sha?.substring(0, 7),
      branch: firstTest.branch,
      pr_number: firstTest.pr_number,
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
  return match?.[1] ?? null;
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

/**
 * Extract error signature for pattern grouping.
 * Normalizes errors to group similar failures together.
 */
function extractErrorSignature(logs: string | null): string {
  if (!logs) return 'Unknown error';

  const firstLine = logs.split('\n')[0]?.trim() || '';

  // Common error patterns to normalize
  const patterns: [RegExp, string][] = [
    [/is not a function/i, 'X is not a function'],
    [/Cannot read propert(y|ies) of (undefined|null)/i, 'Cannot read properties of undefined/null'],
    [/Cannot find module ['"]([^'"]+)['"]/i, 'Cannot find module'],
    [/Expected.*but received/i, 'Assertion: expected vs received'],
    [/expect\(received\)\.toBe\(expected\)/i, 'Assertion: toBe mismatch'],
    [/expect\(received\)\.toEqual\(expected\)/i, 'Assertion: toEqual mismatch'],
    [/expect\(received\)\.toHaveBeenCalled/i, 'Assertion: function not called'],
    [/Number of calls: 0/i, 'Mock function not called'],
    [/Timeout.*exceeded/i, 'Timeout exceeded'],
    [/ECONNREFUSED/i, 'Connection refused'],
    [/ENOTFOUND/i, 'DNS lookup failed'],
    [/TypeError:/i, 'TypeError'],
    [/ReferenceError:/i, 'ReferenceError'],
    [/SyntaxError:/i, 'SyntaxError'],
  ];

  for (const [regex, label] of patterns) {
    if (regex.test(firstLine) || regex.test(logs)) {
      return label;
    }
  }

  // Fallback: use first 80 chars of first line
  return firstLine.substring(0, 80) || 'Unknown error';
}

export const getFailuresByPatternSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
  job_id: z.string().describe('GitHub Actions job ID'),
  top_n: z
    .number()
    .optional()
    .describe('Number of top error patterns to return (default: 10)'),
});

export async function getFailuresByPattern(
  client: BlacksmithClient,
  args: z.infer<typeof getFailuresByPatternSchema>
) {
  // Validate job exists by fetching run details first
  const runDetail = await client.getRun(args.run_id);
  const jobExists = runDetail.jobs?.some(j => String(j.id) === args.job_id);

  if (!jobExists) {
    return {
      error: `Job ${args.job_id} not found in run ${args.run_id}`,
      available_jobs: runDetail.jobs?.map(j => ({
        id: j.id,
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
      })) ?? [],
      suggestion: 'Use one of the available job IDs listed above.',
    };
  }

  const response = await client.getJobTests(args.run_id, args.job_id, 'fail');
  const tests = response.tests ?? [];
  const topN = args.top_n ?? 10;

  if (tests.length === 0 && (response.total_count ?? 0) === 0) {
    // Check if there are ANY tests for this job
    const allTests = await client.getJobTests(args.run_id, args.job_id);
    if ((allTests.total_count ?? 0) === 0) {
      return {
        error: 'No test results found for this job',
        job_id: args.job_id,
        suggestion: 'Test results may not be uploaded for this job. Ensure your CI uploads JUnit XML or similar test reports.',
        docs_hint: 'Blacksmith auto-ingests test results from standard JUnit XML format.',
      };
    }
    // Tests exist but none failed
    return {
      summary: { total_failed: 0, unique_patterns: 0, showing_top: 0 },
      patterns: [],
      insight: 'All tests passed! No failures to analyze.',
    };
  }

  // Group tests by error signature
  const byPattern = new Map<string, {
    count: number;
    suites: Set<string>;
    files: Set<string>;
    sample_test: string;
    sample_error: string;
  }>();

  for (const test of tests) {
    const signature = extractErrorSignature(test.logs);
    const existing = byPattern.get(signature) ?? {
      count: 0,
      suites: new Set(),
      files: new Set(),
      sample_test: test.test_name,
      sample_error: truncateError(test.logs, 5) ?? '',
    };

    existing.count++;
    if (test.test_suite) existing.suites.add(test.test_suite);
    const file = extractFilePath(test.logs);
    if (file) existing.files.add(file);

    byPattern.set(signature, existing);
  }

  // Sort by count descending
  const sortedPatterns = Array.from(byPattern.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN);

  // Extract commit info once
  const firstTest = tests[0];

  return {
    summary: {
      total_failed: response.total_count ?? tests.length,
      unique_patterns: byPattern.size,
      showing_top: sortedPatterns.length,
    },
    patterns: sortedPatterns.map(([pattern, data]) => ({
      error_pattern: pattern,
      count: data.count,
      percentage: Math.round((data.count / tests.length) * 100),
      affected_suites: Array.from(data.suites).slice(0, 5),
      affected_files: Array.from(data.files).slice(0, 5),
      sample_test: data.sample_test,
      sample_error: data.sample_error,
    })),
    commit: firstTest ? {
      sha: firstTest.sha?.substring(0, 7),
      branch: firstTest.branch,
      pr_number: firstTest.pr_number,
    } : null,
  };
}

export const compareTestRunsSchema = z.object({
  run_id: z.string().describe('Current GitHub Actions workflow run ID'),
  job_name: z.string().describe('Job name to compare (e.g., "Test (Blacksmith/Self-Hosted)")'),
  base_run_id: z
    .string()
    .optional()
    .describe('Base run ID to compare against. If not provided, compares against most recent prior run.'),
});

export async function compareTestRuns(
  client: BlacksmithClient,
  args: z.infer<typeof compareTestRunsSchema>
) {
  // Get current run's jobs to find the matching job
  const currentRun = await client.getRun(args.run_id);
  const currentJob = currentRun.jobs?.find(j => j.name === args.job_name);

  if (!currentJob) {
    return {
      error: `Job "${args.job_name}" not found in run ${args.run_id}`,
      available_jobs: currentRun.jobs?.map(j => j.name) ?? [],
    };
  }

  // Get failed tests from current run
  const currentTests = await client.getJobTests(args.run_id, String(currentJob.id), 'fail');
  const currentFailedSet = new Set(
    (currentTests.tests ?? []).map(t => `${t.test_suite}::${t.test_name}`)
  );

  // Find base run to compare against
  let baseRunId = args.base_run_id;
  if (!baseRunId) {
    // Get recent runs and find the previous one
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const runs = await client.listRuns({ startDate, endDate });

    const sortedRuns = runs
      .filter((r) => String(r.id) !== args.run_id && isRunCompleted(r))
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

    if (sortedRuns.length === 0) {
      return {
        error: 'No previous completed runs found to compare against',
        current_failures: currentTests.total_count ?? 0,
      };
    }
    const previousRun = sortedRuns[0];
    if (!previousRun) {
      return {
        error: 'No previous completed runs found to compare against',
        current_failures: currentTests.total_count ?? 0,
      };
    }
    baseRunId = String(previousRun.id);
  }

  // Get base run's jobs
  const baseRun = await client.getRun(baseRunId);
  const baseJob = baseRun.jobs?.find(j => j.name === args.job_name);

  if (!baseJob) {
    return {
      error: `Job "${args.job_name}" not found in base run ${baseRunId}`,
      current_failures: currentTests.total_count ?? 0,
    };
  }

  // Get failed tests from base run
  const baseTests = await client.getJobTests(baseRunId, String(baseJob.id), 'fail');
  const baseFailedSet = new Set(
    (baseTests.tests ?? []).map(t => `${t.test_suite}::${t.test_name}`)
  );

  // Calculate differences
  const newFailures: string[] = [];
  const fixedTests: string[] = [];
  const persistentFailures: string[] = [];

  for (const test of currentFailedSet) {
    if (baseFailedSet.has(test)) {
      persistentFailures.push(test);
    } else {
      newFailures.push(test);
    }
  }

  for (const test of baseFailedSet) {
    if (!currentFailedSet.has(test)) {
      fixedTests.push(test);
    }
  }

  return {
    summary: {
      current_run: args.run_id,
      base_run: baseRunId,
      current_failures: currentFailedSet.size,
      base_failures: baseFailedSet.size,
      new_failures: newFailures.length,
      fixed_tests: fixedTests.length,
      persistent_failures: persistentFailures.length,
    },
    new_failures: newFailures.slice(0, 20).map(t => {
      const [suite, name] = t.split('::');
      return { suite, name };
    }),
    fixed_tests: fixedTests.slice(0, 20).map(t => {
      const [suite, name] = t.split('::');
      return { suite, name };
    }),
    assessment: newFailures.length === 0
      ? 'No new test failures introduced'
      : `${newFailures.length} new test failure(s) introduced in this run`,
  };
}

// ==================== Flaky Test Detection ====================

export const getFlakyTestsSchema = z.object({
  job_name: z.string().describe('Job name to analyze (e.g., "Test (Blacksmith/Self-Hosted)")'),
  days: z
    .number()
    .optional()
    .describe('Number of days to analyze (default: 7)'),
  threshold: z
    .number()
    .optional()
    .describe('Flakiness threshold 0-1, e.g., 0.2 means test failed 20%+ of runs (default: 0.1)'),
  min_runs: z
    .number()
    .optional()
    .describe('Minimum number of runs a test must appear in to be considered (default: 3)'),
});

export async function getFlakyTests(
  client: BlacksmithClient,
  args: z.infer<typeof getFlakyTestsSchema>
) {
  const days = args.days ?? 7;
  const threshold = args.threshold ?? 0.1;
  const minRuns = args.min_runs ?? 3;

  // Get recent runs
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const runs = await client.listRuns({ startDate, endDate });
  const completedRuns = runs.filter(isRunCompleted);

  if (completedRuns.length < minRuns) {
    return {
      error: 'Insufficient data for flaky test detection',
      details: {
        runs_found: completedRuns.length,
        runs_required: minRuns,
        days_searched: days,
      },
      suggestions: [
        completedRuns.length === 0
          ? 'No completed runs found. Verify the job_name matches exactly (case-sensitive).'
          : `Found ${completedRuns.length} runs, need at least ${minRuns}. Try increasing the 'days' parameter.`,
        'Flaky detection requires test results from multiple runs.',
        'Ensure your CI uploads JUnit XML or similar test reports.',
      ],
      available_workflows: runs.length > 0
        ? [...new Set(runs.map(r => r.workflow_name).filter(Boolean))].slice(0, 5)
        : undefined,
    };
  }

  // Track test results across runs: test_key -> { passed: number, failed: number, runs: string[] }
  const testHistory = new Map<string, {
    suite: string;
    name: string;
    passed: number;
    failed: number;
    runs: { run_id: string; status: string; date?: string }[];
  }>();

  // Analyze each run
  let runsAnalyzed = 0;
  for (const run of completedRuns.slice(0, 20)) { // Limit to 20 runs to avoid too many API calls
    const runDetail = await client.getRun(String(run.id));
    const job = runDetail.jobs?.find(j => j.name === args.job_name);

    if (!job) continue;

    const tests = await client.getJobTests(String(run.id), String(job.id));
    runsAnalyzed++;

    for (const test of tests.tests ?? []) {
      const key = `${test.test_suite}::${test.test_name}`;
      const existing = testHistory.get(key) ?? {
        suite: test.test_suite ?? 'Unknown',
        name: test.test_name,
        passed: 0,
        failed: 0,
        runs: [],
      };

      if (test.test_status === 'pass') {
        existing.passed++;
      } else if (test.test_status === 'fail') {
        existing.failed++;
      }

      existing.runs.push({
        run_id: String(run.id),
        status: test.test_status,
        date: run.created_at,
      });

      testHistory.set(key, existing);
    }
  }

  // Calculate flakiness and filter
  const flakyTests: {
    suite: string;
    name: string;
    flakiness: number;
    passed: number;
    failed: number;
    total_runs: number;
    recent_results: string[];
  }[] = [];

  for (const [, data] of testHistory) {
    const totalRuns = data.passed + data.failed;
    if (totalRuns < minRuns) continue;

    const flakiness = data.failed / totalRuns;

    // A test is flaky if it fails sometimes but not always
    if (flakiness >= threshold && flakiness < 1.0) {
      flakyTests.push({
        suite: data.suite,
        name: data.name,
        flakiness: Math.round(flakiness * 100) / 100,
        passed: data.passed,
        failed: data.failed,
        total_runs: totalRuns,
        recent_results: data.runs
          .slice(-10)
          .map(r => r.status === 'pass' ? '✓' : '✗')
          .join(''),
      });
    }
  }

  // Sort by flakiness descending
  flakyTests.sort((a, b) => b.flakiness - a.flakiness);

  return {
    summary: {
      days_analyzed: days,
      runs_analyzed: runsAnalyzed,
      threshold_used: threshold,
      flaky_tests_found: flakyTests.length,
    },
    flaky_tests: flakyTests.slice(0, 30),
    insight: flakyTests.length === 0
      ? 'No flaky tests detected at this threshold.'
      : `Found ${flakyTests.length} flaky test(s). Top offender: "${flakyTests[0]?.name}" fails ${Math.round((flakyTests[0]?.flakiness ?? 0) * 100)}% of the time.`,
  };
}

// ==================== Slow Test Detection ====================

export const getSlowTestsSchema = z.object({
  run_id: z.string().describe('GitHub Actions workflow run ID'),
  job_id: z.string().describe('GitHub Actions job ID'),
  threshold_ms: z
    .number()
    .optional()
    .describe('Duration threshold in milliseconds (default: 5000ms = 5s)'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of slow tests to return (default: 20)'),
});

export async function getSlowTests(
  client: BlacksmithClient,
  args: z.infer<typeof getSlowTestsSchema>
) {
  const thresholdMs = args.threshold_ms ?? 5000;
  const limit = args.limit ?? 20;

  const response = await client.getJobTests(args.run_id, args.job_id);
  const tests = response.tests ?? [];

  // Filter and sort by duration
  const slowTests = tests
    .filter(t => (t.duration_seconds ?? 0) * 1000 >= thresholdMs)
    .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))
    .slice(0, limit)
    .map(t => ({
      name: t.test_name,
      suite: t.test_suite,
      duration_ms: Math.round((t.duration_seconds ?? 0) * 1000),
      duration_human: formatDuration((t.duration_seconds ?? 0) * 1000),
      status: t.test_status,
    }));

  // Calculate stats
  const allDurations = tests
    .map(t => (t.duration_seconds ?? 0) * 1000)
    .filter(d => d > 0);

  const avgDuration = allDurations.length > 0
    ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
    : 0;

  const totalTime = allDurations.reduce((a, b) => a + b, 0);
  const slowTestTime = slowTests.reduce((a, t) => a + t.duration_ms, 0);

  return {
    summary: {
      threshold_ms: thresholdMs,
      total_tests: tests.length,
      slow_tests_count: slowTests.length,
      avg_test_duration_ms: Math.round(avgDuration),
      total_test_time: formatDuration(totalTime),
      slow_tests_percentage_of_time: totalTime > 0
        ? Math.round((slowTestTime / totalTime) * 100)
        : 0,
    },
    slow_tests: slowTests,
    insight: slowTests.length === 0
      ? `No tests exceed ${thresholdMs}ms threshold.`
      : `${slowTests.length} tests exceed ${thresholdMs}ms. They account for ${Math.round((slowTestTime / totalTime) * 100)}% of total test time.`,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ==================== Test History ====================

export const getTestHistorySchema = z.object({
  test_name: z.string().describe('Name of the test to look up'),
  suite: z
    .string()
    .optional()
    .describe('Test suite name (helps disambiguate if multiple tests have same name)'),
  job_name: z.string().describe('Job name to search in (e.g., "Test (Blacksmith/Self-Hosted)")'),
  limit: z
    .number()
    .optional()
    .describe('Number of historical results to return (default: 10)'),
});

export async function getTestHistory(
  client: BlacksmithClient,
  args: z.infer<typeof getTestHistorySchema>
) {
  const limit = args.limit ?? 10;

  // Get recent runs
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(); // Last 14 days
  const runs = await client.listRuns({ startDate, endDate });

  const completedRuns = runs
    .filter(isRunCompleted)
    .sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

  const history: {
    run_id: string;
    date: string;
    branch?: string;
    status: string;
    duration_ms: number;
    error?: string;
  }[] = [];

  // Search through runs for this test
  for (const run of completedRuns) {
    if (history.length >= limit) break;

    const runDetail = await client.getRun(String(run.id));
    const job = runDetail.jobs?.find(j => j.name === args.job_name);
    if (!job) continue;

    const tests = await client.getJobTests(String(run.id), String(job.id));

    // Find the specific test
    const testMatch = (tests.tests ?? []).find(t => {
      const nameMatch = t.test_name.toLowerCase().includes(args.test_name.toLowerCase()) ||
                       args.test_name.toLowerCase().includes(t.test_name.toLowerCase());
      const suiteMatch = !args.suite || t.test_suite?.toLowerCase().includes(args.suite.toLowerCase());
      return nameMatch && suiteMatch;
    });

    if (testMatch) {
      history.push({
        run_id: String(run.id),
        date: run.created_at ?? 'Unknown',
        branch: run.head_branch ?? run.branch_name,
        status: testMatch.test_status,
        duration_ms: Math.round((testMatch.duration_seconds ?? 0) * 1000),
        error: testMatch.test_status === 'fail'
          ? truncateError(testMatch.logs, 3) ?? undefined
          : undefined,
      });
    }
  }

  // Calculate stats
  const passCount = history.filter(h => h.status === 'pass').length;
  const failCount = history.filter(h => h.status === 'fail').length;

  return {
    test: {
      name: args.test_name,
      suite: args.suite ?? 'any',
    },
    summary: {
      runs_found: history.length,
      passed: passCount,
      failed: failCount,
      pass_rate: history.length > 0 ? Math.round((passCount / history.length) * 100) : 0,
    },
    history,
    insight: history.length === 0
      ? 'Test not found in recent runs. Check the test name and job name.'
      : failCount === 0
        ? `Test has passed ${passCount} consecutive times.`
        : `Test has failed ${failCount} of last ${history.length} runs (${Math.round((failCount / history.length) * 100)}% failure rate).`,
  };
}

// ==================== Historical Trends ====================

export const getTrendsSchema = z.object({
  metric: z
    .enum(['duration', 'failure_rate', 'test_count'])
    .describe('Metric to track: duration (job runtime), failure_rate (% tests failing), test_count (total tests)'),
  job_name: z.string().describe('Job name to analyze (e.g., "Test (Blacksmith/Self-Hosted)")'),
  days: z
    .number()
    .optional()
    .describe('Number of days to analyze (default: 14)'),
  granularity: z
    .enum(['day', 'week'])
    .optional()
    .describe('Group data by day or week (default: day)'),
});

export async function getTrends(
  client: BlacksmithClient,
  args: z.infer<typeof getTrendsSchema>
) {
  const days = args.days ?? 14;
  const granularity = args.granularity ?? 'day';

  // Get runs for the period
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const runs = await client.listRuns({ startDate, endDate });

  const completedRuns = runs
    .filter(isRunCompleted)
    .sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB; // Chronological order
    });

  if (completedRuns.length === 0) {
    // Provide debug info to help diagnose
    const sampleRun = runs[0];
    return {
      error: 'No completed runs found in the specified period',
      days_searched: days,
      total_runs_found: runs.length,
      debug: sampleRun ? {
        sample_status: sampleRun.status,
        sample_conclusion: sampleRun.conclusion,
        sample_duration: sampleRun.duration_seconds,
      } : undefined,
      suggestion: runs.length > 0
        ? 'Runs were found but none matched completion criteria. Please report this with the debug info above.'
        : 'Try increasing the days parameter or verify the organization has recent workflow runs.',
    };
  }

  // Collect data points
  const dataPoints: { date: string; run_id: number; value: number }[] = [];

  for (const run of completedRuns.slice(0, 30)) { // Limit API calls
    const runDetail = await client.getRun(String(run.id));
    const job = runDetail.jobs?.find(j => j.name === args.job_name);
    if (!job) continue;

    let value: number;

    if (args.metric === 'duration') {
      value = job.runtime_seconds ?? 0;
    } else {
      // Need test data for failure_rate and test_count
      const tests = await client.getJobTests(String(run.id), String(job.id));
      const testList = tests.tests ?? [];

      if (args.metric === 'failure_rate') {
        const failed = testList.filter(t => t.test_status === 'fail').length;
        value = testList.length > 0 ? (failed / testList.length) * 100 : 0;
      } else {
        // test_count
        value = tests.total_count ?? testList.length;
      }
    }

    const dateStr = run.created_at?.split('T')[0] ?? 'unknown';
    dataPoints.push({
      date: dateStr,
      run_id: run.id,
      value: Math.round(value * 100) / 100,
    });
  }

  if (dataPoints.length === 0) {
    return {
      error: `Job "${args.job_name}" not found in any runs`,
      suggestion: 'Verify the job_name matches exactly (case-sensitive).',
    };
  }

  // Group by granularity
  const grouped = new Map<string, number[]>();
  for (const dp of dataPoints) {
    let key: string;
    if (granularity === 'week') {
      const date = new Date(dp.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = dp.date;
    }
    const existing = grouped.get(key) ?? [];
    existing.push(dp.value);
    grouped.set(key, existing);
  }

  // Calculate averages per period
  const aggregated = Array.from(grouped.entries())
    .map(([date, values]) => ({
      date,
      value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
      sample_size: values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate trend
  const firstHalf = aggregated.slice(0, Math.floor(aggregated.length / 2));
  const secondHalf = aggregated.slice(Math.floor(aggregated.length / 2));

  const avgFirst = firstHalf.length > 0
    ? firstHalf.reduce((a, b) => a + b.value, 0) / firstHalf.length
    : 0;
  const avgSecond = secondHalf.length > 0
    ? secondHalf.reduce((a, b) => a + b.value, 0) / secondHalf.length
    : 0;

  const changePercent = avgFirst > 0
    ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
    : 0;

  let trend: 'improving' | 'degrading' | 'stable';
  if (args.metric === 'failure_rate') {
    // For failure rate, lower is better
    trend = changePercent < -10 ? 'improving' : changePercent > 10 ? 'degrading' : 'stable';
  } else if (args.metric === 'duration') {
    // For duration, lower is better
    trend = changePercent < -10 ? 'improving' : changePercent > 10 ? 'degrading' : 'stable';
  } else {
    // For test_count, more is usually neutral/good
    trend = 'stable';
  }

  const metricUnits = {
    duration: 'seconds',
    failure_rate: '%',
    test_count: 'tests',
  };

  return {
    metric: args.metric,
    unit: metricUnits[args.metric],
    period: { days, granularity },
    summary: {
      data_points: aggregated.length,
      runs_analyzed: dataPoints.length,
      current_avg: avgSecond,
      previous_avg: avgFirst,
      change_percent: changePercent,
      trend,
    },
    data: aggregated,
    insight: getTrendInsight(args.metric, trend, changePercent, avgSecond),
  };
}

function getTrendInsight(
  metric: string,
  trend: string,
  changePercent: number,
  currentValue: number
): string {
  const direction = changePercent > 0 ? 'increased' : 'decreased';
  const absChange = Math.abs(changePercent);

  switch (metric) {
    case 'duration':
      if (trend === 'degrading') {
        return `⚠️ Job duration ${direction} by ${absChange}%. Current average: ${formatDuration(currentValue * 1000)}. Consider investigating slow tests.`;
      } else if (trend === 'improving') {
        return `✓ Job duration ${direction} by ${absChange}%. Current average: ${formatDuration(currentValue * 1000)}.`;
      }
      return `Job duration is stable at ~${formatDuration(currentValue * 1000)}.`;

    case 'failure_rate':
      if (trend === 'degrading') {
        return `⚠️ Failure rate ${direction} by ${absChange}%. Current: ${currentValue.toFixed(1)}% of tests failing.`;
      } else if (trend === 'improving') {
        return `✓ Failure rate ${direction} by ${absChange}%. Current: ${currentValue.toFixed(1)}% of tests failing.`;
      }
      return `Failure rate is stable at ~${currentValue.toFixed(1)}%.`;

    case 'test_count':
      return `Test count ${direction} by ${absChange}%. Current: ${Math.round(currentValue)} tests.`;

    default:
      return `${metric} is ${trend}.`;
  }
}
