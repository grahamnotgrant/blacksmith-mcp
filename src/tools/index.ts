/**
 * Tool registration and execution.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { BlacksmithClient } from '../client.js';

// Import tool schemas and handlers
import {
  listOrgsSchema,
  getOrgStatusSchema,
  listOrgs,
  getOrgStatus,
} from './org.js';
import {
  listRunsSchema,
  getRunSchema,
  listJobsSchema,
  listRuns,
  getRun,
  listJobs,
} from './runs.js';
import {
  getJobSchema,
  getJobLogsSchema,
  getJob,
  getJobLogs,
} from './jobs.js';
import {
  getJobTestsSchema,
  getFailedTestsSchema,
  getFailuresByPatternSchema,
  compareTestRunsSchema,
  getFlakyTestsSchema,
  getSlowTestsSchema,
  getTestHistorySchema,
  getTrendsSchema,
  getJobTests,
  getFailedTests,
  getFailuresByPattern,
  compareTestRuns,
  getFlakyTests,
  getSlowTests,
  getTestHistory,
  getTrends,
} from './tests.js';
import {
  getCurrentUsageSchema,
  getInvoiceAmountSchema,
  getUsageSummarySchema,
  getCacheStatsSchema,
  getCacheEntriesSchema,
  getCurrentUsage,
  getInvoiceAmount,
  getUsageSummary,
  getCacheStats,
  getCacheEntries,
} from './usage.js';
import {
  searchLogsSchema,
  searchLogs,
} from './logs.js';

/**
 * Tool definition with metadata.
 */
interface ToolDefinition {
  name: string;
  description: string;
  schema: Parameters<typeof zodToJsonSchema>[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (client: BlacksmithClient, args: any) => Promise<unknown>;
}

/**
 * All available tools.
 */
const tools: ToolDefinition[] = [
  // Organization
  {
    name: 'list_orgs',
    description:
      'List all Blacksmith organizations accessible to your account. Use this first to see available orgs.',
    schema: listOrgsSchema,
    handler: listOrgs,
  },
  {
    name: 'get_org_status',
    description:
      'Get the status of the current organization (personal org, onboarding, runner region).',
    schema: getOrgStatusSchema,
    handler: getOrgStatus,
  },

  // Workflow Runs
  {
    name: 'list_runs',
    description:
      'List workflow runs with filtering. Filter by status (success/failure/cancelled/skipped/in_progress), branch, workflow name, actor, or PR number. Example: list_runs(status="failure") to find failed runs.',
    schema: listRunsSchema,
    handler: listRuns,
  },
  {
    name: 'get_run',
    description:
      'Get details of a specific workflow run by ID. Includes list of jobs.',
    schema: getRunSchema,
    handler: getRun,
  },
  {
    name: 'list_jobs',
    description:
      'List all jobs for a specific workflow run. Use this to get job IDs for get_job, get_job_logs, and get_job_tests.',
    schema: listJobsSchema,
    handler: listJobs,
  },

  // Jobs
  {
    name: 'get_job',
    description:
      'Get details of a specific job including steps, runner info, and timing.',
    schema: getJobSchema,
    handler: getJob,
  },
  {
    name: 'get_job_logs',
    description:
      'Get the logs for a specific job. Returns raw log output.',
    schema: getJobLogsSchema,
    handler: getJobLogs,
  },

  // Tests
  {
    name: 'get_job_tests',
    description:
      'Get test results for a job. Optionally filter by status (pass/fail/skip).',
    schema: getJobTestsSchema,
    handler: getJobTests,
  },
  {
    name: 'get_failed_tests',
    description:
      'Get failed tests for a job with full error details. Use error_lines param to control stack trace length. Returns all failures by default (no limit).',
    schema: getFailedTestsSchema,
    handler: getFailedTests,
  },
  {
    name: 'get_failures_by_pattern',
    description:
      'Group failed tests by error pattern (e.g., "is not a function", "Cannot read properties"). Shows count, affected suites/files, and sample error for each pattern. Best for quickly identifying root causes.',
    schema: getFailuresByPatternSchema,
    handler: getFailuresByPattern,
  },
  {
    name: 'compare_test_runs',
    description:
      'Compare test failures between two runs to identify regressions. Shows new failures, fixed tests, and persistent failures. If base_run_id not provided, compares against most recent prior run.',
    schema: compareTestRunsSchema,
    handler: compareTestRuns,
  },
  {
    name: 'get_flaky_tests',
    description:
      'Detect flaky tests by analyzing pass/fail patterns across recent runs. Returns tests that fail intermittently (e.g., "failed 3 of 10 runs"). Killer feature for CI stability.',
    schema: getFlakyTestsSchema,
    handler: getFlakyTests,
  },
  {
    name: 'get_slow_tests',
    description:
      'Find tests exceeding a duration threshold. Shows slowest tests, their percentage of total test time, and average duration stats.',
    schema: getSlowTestsSchema,
    handler: getSlowTests,
  },
  {
    name: 'get_test_history',
    description:
      'Get the failure history for a specific test across recent runs. Shows when it passed/failed, on which branches, and error messages for failures.',
    schema: getTestHistorySchema,
    handler: getTestHistory,
  },
  {
    name: 'get_trends',
    description:
      'Track metrics over time: duration (are tests getting slower?), failure_rate (are tests getting flakier?), test_count (are we adding tests?). Returns trend analysis with data points.',
    schema: getTrendsSchema,
    handler: getTrends,
  },

  // Usage
  {
    name: 'get_current_usage',
    description:
      'Get current core usage snapshot (active cores vs max cores).',
    schema: getCurrentUsageSchema,
    handler: getCurrentUsage,
  },
  {
    name: 'get_invoice_amount',
    description:
      'Get the current billing period invoice amount.',
    schema: getInvoiceAmountSchema,
    handler: getInvoiceAmount,
  },
  {
    name: 'get_usage_summary',
    description:
      'Get usage summary showing billable minutes vs free tier allowance. Shows remaining free minutes and overage.',
    schema: getUsageSummarySchema,
    handler: getUsageSummary,
  },
  {
    name: 'get_cache_stats',
    description:
      'Get Blacksmith cache statistics: total size, hit rate, entries by repository. Shows how effectively caching is being used.',
    schema: getCacheStatsSchema,
    handler: getCacheStats,
  },
  {
    name: 'get_cache_entries',
    description:
      'Get detailed cache entries for a repository. Shows cache keys, sizes, scopes (branches), and last hit times. Useful for debugging cache issues.',
    schema: getCacheEntriesSchema,
    handler: getCacheEntries,
  },
  {
    name: 'search_logs',
    description:
      'Search logs across all jobs. Filter by query (e.g., "error", "timeout"), log level (INFO/WARN/ERROR/DEBUG), and time range. Great for finding issues across runs.',
    schema: searchLogsSchema,
    handler: searchLogs,
  },
];

/**
 * Get MCP tool definitions.
 */
export function getToolDefinitions(): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.schema) as Tool['inputSchema'],
  }));
}

/**
 * Execute a tool by name.
 */
export async function executeTool(
  client: BlacksmithClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.handler(client, args);
}
