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
  OrgSettings,
  CoreUsage,
  InvoiceAmount,
  WorkflowRun,
  RunDetailResponse,
  Job,
  JobMetrics,
  TestsResponse,
  LogSearchResponse,
  CacheStatsResponse,
  CacheEntriesResponse,
} from './types/blacksmith.js';

const BASE_URL = 'https://dashboardbackend.blacksmith.sh/api/user/github/orgs';

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

  /**
   * Make an authenticated request returning raw text (for NDJSON/streaming responses).
   */
  private async orgRequestText(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<string> {
    const org = this.getOrg();
    const url = `${BASE_URL}/${org}/${endpoint}`;

    logger.debug(`Requesting text: ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
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

    return response.text();
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

  /**
   * Get all org settings aggregated via Promise.allSettled.
   */
  async getOrgSettings(): Promise<OrgSettings> {
    const [
      email, threshold, timeout, region,
      docker, branch, logIngestion, ssh,
      ghComments, prComments,
    ] = await Promise.allSettled([
      this.orgRequest<unknown>('primary-email'),
      this.orgRequest<unknown>('email-alert-threshold'),
      this.orgRequest<unknown>('max-timeout/settings'),
      this.orgRequest<{ region: string | null }>('runner-region'),
      this.orgRequest<unknown>('docker-container-caching'),
      this.orgRequest<unknown>('branch-protection'),
      this.orgRequest<unknown>('log-ingestion/settings'),
      this.orgRequest<unknown>('ssh/settings'),
      this.orgRequest<unknown>('github-comments'),
      this.orgRequest<unknown>('user-pr-comment-settings'),
    ]);

    const val = <T>(r: PromiseSettledResult<T>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    return {
      primary_email: val(email) as string | null,
      email_alert_threshold: val(threshold) as number | null,
      max_timeout: val(timeout),
      runner_region: val(region)?.region ?? null,
      docker_container_caching: val(docker),
      branch_protection: val(branch),
      log_ingestion: val(logIngestion),
      ssh: val(ssh),
      github_comments: val(ghComments),
      user_pr_comment_settings: val(prComments),
    };
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

  /**
   * Get core usage timeseries.
   */
  async getCoreUsageTimeseries(params: {
    windowSize?: number;
    startDate: string;
    endDate: string;
  }): Promise<unknown> {
    const searchParams = new URLSearchParams();
    searchParams.set('window_size', String(params.windowSize ?? 15));
    searchParams.set('start_date', params.startDate);
    searchParams.set('end_date', params.endDate);
    return this.orgRequest<unknown>(`metrics/core-usage/timeseries?${searchParams.toString()}`);
  }

  // ==================== Monitors ====================

  /**
   * Get monitoring/alerting rules.
   */
  async getMonitoringRules(params: {
    timelineStartDate: string;
    timelineEndDate: string;
    limit?: number;
  }): Promise<unknown> {
    const searchParams = new URLSearchParams();
    searchParams.set('timeline_start_date', params.timelineStartDate);
    searchParams.set('timeline_end_date', params.timelineEndDate);
    searchParams.set('limit', String(params.limit ?? 25));
    return this.orgRequest<unknown>(`monitoring/rules?${searchParams.toString()}`);
  }

  // ==================== Analytics ====================

  /**
   * Get daily job metrics (counts, durations, failure rates).
   */
  async getJobsDaily(startDate: string, endDate: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    return this.orgRequest<unknown>(`metrics/actions/jobs/daily?${params.toString()}`);
  }

  /**
   * Get aggregate job stats for a period.
   */
  async getJobsStandalone(startDate: string, endDate: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    return this.orgRequest<unknown>(`metrics/actions/jobs/standalone?${params.toString()}`);
  }

  /**
   * Get job metrics broken down by dimension (repository, workflow, runner, branch).
   */
  async getJobsSplitGraph(params: {
    startDate: string;
    endDate: string;
    dimension?: string;
    metric?: string;
    sortMethod?: string;
    topN?: number;
  }): Promise<unknown> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_date', this.toISODate(params.startDate));
    searchParams.set('end_date', this.toISODate(params.endDate, true));
    searchParams.set('sort_method', params.sortMethod ?? 'desc');
    searchParams.set('metric', params.metric ?? 'jobs');
    searchParams.set('dimension', params.dimension ?? 'repository');
    searchParams.set('top_n', String(params.topN ?? 20));
    return this.orgRequest<unknown>(`metrics/actions/jobs/split-graph?${searchParams.toString()}`);
  }

  /**
   * Get runner types used in a period.
   */
  async getJobsRunnerTypes(startDate: string, endDate: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    return this.orgRequest<unknown>(`metrics/actions/jobs/runner-types?${params.toString()}`);
  }

  /**
   * Get repositories with CI activity in a period.
   */
  async getJobsRepositories(startDate: string, endDate: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    return this.orgRequest<unknown>(`metrics/actions/jobs/repositories?${params.toString()}`);
  }

  /**
   * Get branches with CI activity in a period.
   */
  async getJobsBranches(startDate: string, endDate: string, repository: string): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    params.set('repository', repository);
    return this.orgRequest<unknown>(`metrics/actions/jobs/branches?${params.toString()}`);
  }

  /**
   * Get job duration histogram.
   */
  async getJobDurationHistogram(startDate: string, endDate: string, bucketCount = 50): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    params.set('bucket_count', String(bucketCount));
    return this.orgRequest<unknown>(`metrics/actions/jobs/job-duration-histogram?${params.toString()}`);
  }

  /**
   * Get job duration percentile exemplars.
   */
  async getJobDurationExemplars(
    startDate: string,
    endDate: string,
    percentiles: string[] = ['p50', 'p90', 'p95', 'p99', 'pMax']
  ): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    for (const p of percentiles) {
      params.append('percentiles[]', p);
    }
    return this.orgRequest<unknown>(`metrics/actions/jobs/job-duration-histogram/exemplars?${params.toString()}`);
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
   *
   * API uses array params: statuses[], repositories[], workflows[], branches[], users[]
   */
  async listRuns(params: {
    startDate: string;
    endDate: string;
    limit?: number;
    statuses?: string[];
    repositories?: string[];
    branches?: string[];
    workflows?: string[];
    users?: string[];
  }): Promise<WorkflowRun[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_date', this.toISODate(params.startDate, false));
    searchParams.set('end_date', this.toISODate(params.endDate, true));
    if (params.limit) searchParams.set('limit', String(params.limit));

    // API uses array params with [] suffix
    if (params.statuses?.length) {
      for (const status of params.statuses) {
        searchParams.append('statuses[]', status);
      }
    }
    if (params.repositories?.length) {
      for (const repo of params.repositories) {
        searchParams.append('repositories[]', repo);
      }
    }
    if (params.branches?.length) {
      for (const branch of params.branches) {
        searchParams.append('branches[]', branch);
      }
    }
    if (params.workflows?.length) {
      for (const workflow of params.workflows) {
        searchParams.append('workflows[]', workflow);
      }
    }
    if (params.users?.length) {
      for (const user of params.users) {
        searchParams.append('users[]', user);
      }
    }

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

  /**
   * Get available filter options for runs (repos, branches, workflows, users).
   */
  async getRunFilterOptions(): Promise<unknown> {
    return this.orgRequest<unknown>('metrics/actions/workflows/runs/filter-options');
  }

  /**
   * Get run duration histogram.
   */
  async getRunHistogram(startDate: string, endDate: string, bucketCount = 12): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('start_date', this.toISODate(startDate));
    params.set('end_date', this.toISODate(endDate, true));
    params.set('bucket_count', String(bucketCount));
    return this.orgRequest<unknown>(`metrics/actions/workflows/runs/histogram?${params.toString()}`);
  }

  /**
   * Get test results at the run level (no job_id needed).
   */
  async getRunTests(runId: string): Promise<TestsResponse> {
    return this.orgRequest<TestsResponse>(`metrics/actions/workflows/runs/${runId}/tests`);
  }

  /**
   * Get list of actors (users who triggered workflows).
   */
  async getActors(): Promise<unknown> {
    return this.orgRequest<unknown>('metrics/actions/actors');
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

    const text = await this.orgRequestText(
      `metrics/logs/job/stream?${searchParams.toString()}`
    );

    // Response is newline-delimited JSON - parse line by line
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
   * Get available log filter options.
   */
  async getLogFilterOptions(params: {
    startTime: string;
    endTime: string;
    property: string;
  }): Promise<unknown> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_time', params.startTime);
    searchParams.set('end_time', params.endTime);
    searchParams.set('property', params.property);
    return this.orgRequest<unknown>(
      `metrics/logs/search/filter-options?${searchParams.toString()}`
    );
  }

  /**
   * Get log volume histogram over time.
   */
  async getLogHistogram(params: {
    startTime: string;
    endTime: string;
    query?: string;
  }): Promise<unknown> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_time', params.startTime);
    searchParams.set('end_time', params.endTime);
    if (params.query) searchParams.set('query', params.query);
    return this.orgRequest<unknown>(
      `metrics/logs/histogram?${searchParams.toString()}`
    );
  }

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
   * Returns array of repository cache summaries.
   */
  async getCacheStats(includeHistory = false): Promise<CacheStatsResponse> {
    return this.orgRequest<CacheStatsResponse>(
      `metrics/cache?include_history=${includeHistory}`
    );
  }

  /**
   * Get detailed cache entries for a repository.
   * Note: API expects short repo name (e.g., "votion" not "Org/votion").
   */
  async getCacheEntries(
    repository: string,
    params?: { page?: number; perPage?: number; sortBy?: string }
  ): Promise<CacheEntriesResponse> {
    // Extract short repo name if full name provided (API only accepts short name)
    const repoName = repository.includes('/') ? (repository.split('/').pop() ?? repository) : repository;

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params?.page ?? 1));
    searchParams.set('per_page', String(params?.perPage ?? 20));
    searchParams.set('sort_by', params?.sortBy ?? 'lastHitTime');
    searchParams.set('sort_direction', 'desc');

    return this.orgRequest<CacheEntriesResponse>(
      `metrics/cache/repositories/${repoName}?${searchParams.toString()}`
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
    const extracted = await getSessionCookie();
    if (extracted) sessionCookie = extracted;
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
