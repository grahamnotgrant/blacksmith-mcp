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
  listRuns,
  getRun,
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
  getJobTests,
  getFailedTests,
} from './tests.js';
import {
  getCurrentUsageSchema,
  getInvoiceAmountSchema,
  getCurrentUsage,
  getInvoiceAmount,
} from './usage.js';

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
      'List recent workflow runs. Optionally filter by date range.',
    schema: listRunsSchema,
    handler: listRuns,
  },
  {
    name: 'get_run',
    description:
      'Get details of a specific workflow run by ID.',
    schema: getRunSchema,
    handler: getRun,
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
      'Get only failed tests for a job. Includes error messages and stack traces.',
    schema: getFailedTestsSchema,
    handler: getFailedTests,
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
