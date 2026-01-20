/**
 * Blacksmith HTTP client.
 *
 * Handles authentication via session cookie and provides
 * typed methods for all Blacksmith API endpoints.
 */

import { logger } from './utils/logger.js';
import {
  ApiError,
  ConfigurationError,
  SessionExpiredError,
} from './utils/errors.js';
import type {
  OrgsResponse,
  CoreUsage,
  InvoiceAmount,
  WorkflowRun,
  RunDetailResponse,
  Job,
  JobMetrics,
  TestsResponse,
  LogSearchResponse,
  CacheStats,
} from './types/blacksmith.js';

const BASE_URL = 'https://backend.blacksmith.sh/api/user/github/orgs';

export interface BlacksmithClientConfig {
  sessionCookie: string;
  org?: string;
}

export class BlacksmithClient {
  private readonly sessionCookie: string;
  private org: string | null;

  constructor(config: BlacksmithClientConfig) {
    this.sessionCookie = config.sessionCookie;
    this.org = config.org ?? null;
  }

  /**
   * Set the current organization.
   */
  setOrg(org: string): void {
    this.org = org;
  }

  /**
   * Get the current organization, throwing if not set.
   */
  private getOrg(): string {
    if (!this.org) {
      throw new ConfigurationError(
        'No organization set. Use list_orgs to see available orgs, then set BLACKSMITH_ORG.'
      );
    }
    return this.org;
  }

  /**
   * Make an authenticated request to the Blacksmith API.
   * Note: Cookie values from Chrome are already URL-encoded, send them raw.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE_URL}/${path}`;

    logger.debug(`Requesting ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        // Laravel session cookie - send raw (already URL-encoded from Chrome)
        Cookie: `blacksmith_session=${this.sessionCookie}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://app.blacksmith.sh',
        Referer: 'https://app.blacksmith.sh/',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new SessionExpiredError();
    }

    if (!response.ok) {
      const text = await response.text();
      logger.error(`API error: ${response.status} ${text}`);
      throw new ApiError(`API request failed: ${response.status}`, response.status);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an authenticated request to an org-scoped endpoint.
   */
  private async orgRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const org = this.getOrg();
    return this.request<T>(`${org}/${endpoint}`, options);
  }

  // ==================== Organization ====================

  /**
   * List all accessible organizations.
   * Returns the full response including installations and metadata.
   */
  async listOrgs(): Promise<OrgsResponse> {
    return this.request<OrgsResponse>('');
  }

  /**
   * Check if org is a personal org.
   */
  async isPersonalOrg(): Promise<boolean> {
    const result = await this.orgRequest<{ is_personal: boolean }>('is-personal-org');
    return result.is_personal;
  }

  /**
   * Check if org has completed onboarding.
   */
  async hasOnboarded(): Promise<boolean> {
    const result = await this.orgRequest<{ has_onboarded: boolean }>('has-onboarded');
    return result.has_onboarded;
  }

  /**
   * Get the runner region for the org.
   */
  async getRunnerRegion(): Promise<string | null> {
    const result = await this.orgRequest<{ region: string | null }>('runner-region');
    return result.region;
  }

  // ==================== Usage & Billing ====================

  /**
   * Get current core usage snapshot.
   */
  async getCurrentUsage(): Promise<CoreUsage> {
    return this.orgRequest<CoreUsage>('metrics/core-usage/current');
  }

  /**
   * Get current invoice amount.
   */
  async getInvoiceAmount(): Promise<InvoiceAmount> {
    return this.orgRequest<InvoiceAmount>('metrics/invoice-amount');
  }

  /**
   * Get usage summary (billable vs free minutes).
   */
  async getUsageSummary(): Promise<{ billable_minutes: number; free_minutes: number }> {
    return this.orgRequest<{ billable_minutes: number; free_minutes: number }>('usage');
  }

  // ==================== Workflow Runs ====================

  /**
   * Convert YYYY-MM-DD to ISO 8601 format required by Blacksmith API.
   * If already in ISO format, returns as-is.
   */
  private toISODate(date: string, endOfDay = false): string {
    // Already ISO format
    if (date.includes('T')) return date;
    // Convert YYYY-MM-DD to ISO 8601
    return endOfDay ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
  }

  /**
   * List workflow runs.
   * Note: API requires start_date and end_date in ISO 8601 format.
   * Returns raw array of runs (not wrapped in {runs, total_count}).
   */
  async listRuns(params: {
    startDate: string;
    endDate: string;
    limit?: number;
  }): Promise<WorkflowRun[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_date', this.toISODate(params.startDate, false));
    searchParams.set('end_date', this.toISODate(params.endDate, true));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const endpoint = `metrics/actions/workflows/runs?${searchParams.toString()}`;
    return this.orgRequest<WorkflowRun[]>(endpoint);
  }

  /**
   * Get a specific workflow run with jobs.
   * Returns full run detail including embedded jobs array.
   */
  async getRun(runId: string): Promise<RunDetailResponse> {
    return this.orgRequest<RunDetailResponse>(`metrics/actions/workflows/runs/${runId}`);
  }

  // ==================== Jobs ====================

  /**
   * Get job details.
   * Note: API returns {job: Job}, we unwrap it.
   */
  async getJob(runId: string, jobId: string): Promise<Job> {
    const response = await this.orgRequest<{ job: Job }>(
      `metrics/actions/workflows/runs/${runId}/jobs/${jobId}`
    );
    return response.job;
  }

  /**
   * Get job VM metrics.
   */
  async getJobMetrics(runId: string, jobId: string, vmId: string): Promise<JobMetrics> {
    return this.orgRequest<JobMetrics>(
      `metrics/actions/workflows/runs/${runId}/jobs/${jobId}/metrics?vm_id=${vmId}`
    );
  }

  /**
   * Get job logs.
   * Note: API returns newline-delimited JSON (streaming format).
   * Each line can have: log, message, or line field containing the log text.
   */
  async getJobLogs(
    jobId: string,
    params?: { limit?: number; vmId?: string }
  ): Promise<{ logs: string; rawLines: unknown[] }> {
    const searchParams = new URLSearchParams();
    searchParams.set('job_id', jobId);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.vmId) searchParams.set('vm_id', params.vmId);

    const org = this.getOrg();
    const url = `${BASE_URL}/${org}/metrics/logs/job/stream?${searchParams.toString()}`;

    logger.debug(`Fetching logs from: ${url}`);

    const response = await fetch(url, {
      headers: {
        Cookie: `blacksmith_session=${this.sessionCookie}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://app.blacksmith.sh',
        Referer: 'https://app.blacksmith.sh/',
      },
    });

    if (!response.ok) {
      throw new ApiError(`API request failed: ${response.status}`, response.status);
    }

    // Response is newline-delimited JSON - parse line by line
    const text = await response.text();
    const lines = text.trim().split('\n');
    const logs: string[] = [];
    const rawLines: unknown[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        rawLines.push(parsed);
        // Try different field names the API might use
        const logText = parsed.log || parsed.message || parsed.line || parsed.content;
        if (logText) {
          logs.push(logText);
        }
      } catch {
        // If not JSON, treat the line itself as a log entry
        logs.push(line);
      }
    }

    return { logs: logs.join('\n'), rawLines };
  }

  // ==================== Tests ====================

  /**
   * Get test results for a job.
   */
  async getJobTests(
    runId: string,
    jobId: string,
    status?: 'pass' | 'fail' | 'skip'
  ): Promise<TestsResponse> {
    const endpoint = status
      ? `metrics/actions/workflows/runs/${runId}/jobs/${jobId}/tests?status=${status}`
      : `metrics/actions/workflows/runs/${runId}/jobs/${jobId}/tests`;

    return this.orgRequest<TestsResponse>(endpoint);
  }

  // ==================== Logs (Org-Level Search) ====================

  /**
   * Search logs across all jobs.
   */
  async searchLogs(params: {
    startTime: string;
    endTime: string;
    query?: string;
  }): Promise<LogSearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_time', params.startTime);
    searchParams.set('end_time', params.endTime);
    if (params.query) searchParams.set('query', params.query);

    return this.orgRequest<LogSearchResponse>(
      `metrics/logs/search?${searchParams.toString()}`
    );
  }

  // ==================== Cache ====================

  /**
   * Get cache statistics.
   */
  async getCacheStats(includeHistory = false): Promise<CacheStats> {
    return this.orgRequest<CacheStats>(
      `metrics/cache?include_history=${includeHistory}`
    );
  }
}

/**
 * Create a Blacksmith client from environment variables or Chrome.
 * Tries env var first, then auto-extracts from Chrome if logged in.
 */
export async function createClientFromEnv(): Promise<BlacksmithClient> {
  // Try env var first
  let sessionCookie = process.env['BLACKSMITH_SESSION_COOKIE'];

  // If no env var, try to extract from Chrome
  if (!sessionCookie) {
    const { getSessionCookie } = await import('./utils/cookies.js');
    sessionCookie = await getSessionCookie();
  }

  if (!sessionCookie) {
    throw new ConfigurationError(
      'Could not find Blacksmith session. Either:\n' +
        '1. Log into app.blacksmith.sh in Chrome, or\n' +
        '2. Set BLACKSMITH_SESSION_COOKIE environment variable'
    );
  }

  return new BlacksmithClient({
    sessionCookie,
    org: process.env['BLACKSMITH_ORG'],
  });
}
