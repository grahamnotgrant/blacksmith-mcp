/**
 * Blacksmith API response types.
 *
 * These types are reverse-engineered from the Blacksmith web app.
 * The API is undocumented and may change without notice.
 */

// Organization types
export interface Organization {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
}

export interface OrgsResponse {
  total_count: number;
  installations: Organization[];
  active_org_name: string | null;
  is_org_admin: boolean;
}

export interface OrgStatus {
  isPersonalOrg: boolean;
  hasOnboarded: boolean;
  runnerRegion: string | null;
}

export interface OrgSettings {
  primaryEmail: string | null;
  emailAlertThreshold: number | null;
  maxTimeout: number | null;
  logIngestion: {
    enabled: boolean;
  } | null;
}

// Usage types
export interface CoreUsage {
  current_cores: number;
  max_cores: number;
  timestamp: string;
}

export interface UsageTimeseries {
  data: {
    timestamp: string;
    cores: number;
  }[];
  window_size: string;
}

export interface InvoiceAmount {
  amount: number;
  currency?: string;
  period_start?: string;
  period_end?: string;
}

// Workflow run types
export interface WorkflowRun {
  id: number;
  name: string;
  title?: string;
  head_branch?: string;
  branch_name?: string;
  head_sha?: string;
  head_commit?: {
    sha: string;
    message?: string;
  };
  status?: string;
  conclusion?: string | null;
  workflow_id?: string | number;
  workflow_name?: string;
  run_number?: number;
  run_attempt?: number;
  event?: string;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
  duration_seconds?: number;
  jobs_url?: string;
  github_url?: string;
  // Old format (some endpoints)
  repository?: {
    full_name: string;
  };
  // New format (runs list)
  repository_name?: string;
  repository_url?: string;
  actor?: {
    id?: number;
    type?: string;
    login: string;
    avatar_url?: string;
    html_url?: string;
  };
  pull_request?: {
    number: number;
    url: string;
  } | null;
}

// Run detail response (includes jobs)
export interface RunDetailResponse {
  run_id: string;
  workflow_name: string;
  repository_name: string;
  attempts?: {
    attempt: number;
    id: number;
    name: string;
    status: string;
    event: string;
    created_at: string;
    updated_at: string;
    html_url: string;
  }[];
  jobs?: JobSummary[];
}

// Job summary (from run detail)
export interface JobSummary {
  id: string;
  name: string;
  status: string;
  conclusion: string;
  event_status?: string;
  runtime_seconds?: number;
  workflow_name?: string;
  repository_name?: string;
  workflow_run_id?: string;
  workflow_run_attempt?: number;
  labels?: string[];
  steps?: JobStep[];
}

// Job types (full detail)
export interface Job {
  id: number | string;
  run_id?: number | string;
  name: string;
  status: string;
  conclusion: string | null;
  event_status?: string;
  runtime_seconds?: number;
  started_at?: string | null;
  completed_at?: string | null;
  runner_name?: string | null;
  runner_group_name?: string | null;
  workflow_name?: string;
  repository_name?: string;
  workflow_run_id?: string;
  workflow_run_attempt?: number;
  labels?: string[];
  steps?: JobStep[];
}

export interface JobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobMetrics {
  vm_id: string;
  cpu: { timestamp: string; value: number }[];
  memory: { timestamp: string; value: number }[];
}

// Test types
export interface TestResult {
  id: string;
  job_id: string;
  test_type: string;
  test_name: string;
  test_suite: string;
  test_status: 'pass' | 'fail' | 'skip';
  duration_seconds: number | null;
  log_line_start: number | null;
  log_line_end: number | null;
  step_name: string | null;
  step_record_id: string | null;
  step_order: number | null;
  created_at: string;
  repository: string;
  branch: string;
  sha: string;
  commit_message: string;
  pr_number: number | null;
  user: string;
  logs: string | null;
}

export interface TestsResponse {
  tests: TestResult[];
  total_count: number;
}

// Log types
export interface LogEntry {
  timestamp: string;
  message: string;
  level: string;
  job_id: string;
  step_name: string | null;
}

export interface LogSearchResponse {
  logs: LogEntry[];
  total_count: number;
}

// Analytics types
export interface DurationHistogram {
  buckets: {
    min: number;
    max: number;
    count: number;
  }[];
}

export interface SplitGraphData {
  dimension: string;
  metric: string;
  data: {
    name: string;
    value: number;
  }[];
}

// Cache types
export interface CacheStats {
  total_size_bytes: number;
  total_entries: number;
  hit_rate: number;
  repositories: {
    name: string;
    size_bytes: number;
    entries: number;
  }[];
}
