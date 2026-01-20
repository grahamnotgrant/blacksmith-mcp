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
  Organization,
  CoreUsage,
  InvoiceAmount,
  WorkflowRun,
  WorkflowRunsResponse,
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
        Cookie: `session=${this.sessionCookie}`,
        'Content-Type': 'application/json',
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
   */
  async listOrgs(): Promise<Organization[]> {
    return this.request<Organization[]>('');
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

  // ==================== Workflow Runs ====================

  /**
   * List workflow runs.
   */
  async listRuns(params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<WorkflowRunsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('start_date', params.startDate);
    if (params?.endDate) searchParams.set('end_date', params.endDate);
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const query = searchParams.toString();
    const endpoint = query
      ? `metrics/actions/workflows/runs?${query}`
      : 'metrics/actions/workflows/runs';

    return this.orgRequest<WorkflowRunsResponse>(endpoint);
  }

  /**
   * Get a specific workflow run.
   */
  async getRun(runId: string): Promise<WorkflowRun> {
    return this.orgRequest<WorkflowRun>(`metrics/actions/workflows/runs/${runId}`);
  }

  // ==================== Jobs ====================

  /**
   * Get job details.
   */
  async getJob(runId: string, jobId: string): Promise<Job> {
    return this.orgRequest<Job>(
      `metrics/actions/workflows/runs/${runId}/jobs/${jobId}`
    );
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
   */
  async getJobLogs(
    jobId: string,
    params?: { limit?: number; vmId?: string }
  ): Promise<string> {
    const searchParams = new URLSearchParams();
    searchParams.set('job_id', jobId);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.vmId) searchParams.set('vm_id', params.vmId);

    const result = await this.orgRequest<{ logs: string }>(
      `metrics/logs/job/stream?${searchParams.toString()}`
    );
    return result.logs;
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
 * Create a Blacksmith client from environment variables.
 */
export function createClientFromEnv(): BlacksmithClient {
  const sessionCookie = process.env['BLACKSMITH_SESSION_COOKIE'];
  if (!sessionCookie) {
    throw new ConfigurationError(
      'BLACKSMITH_SESSION_COOKIE environment variable is required. ' +
        'Extract your session cookie from Chrome DevTools > Application > Cookies.'
    );
  }

  return new BlacksmithClient({
    sessionCookie,
    org: process.env['BLACKSMITH_ORG'],
  });
}
