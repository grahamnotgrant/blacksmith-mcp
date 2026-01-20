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
  currency: string;
  period_start: string;
  period_end: string;
}

// Workflow run types
export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  workflow_id: number;
  run_number: number;
  event: string;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  jobs_url: string;
  repository: {
    full_name: string;
  };
  actor: {
    login: string;
    avatar_url: string;
  };
}

export interface WorkflowRunsResponse {
  runs: WorkflowRun[];
  total_count: number;
}

// Job types
export interface Job {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  runner_name: string | null;
  runner_group_name: string | null;
  labels: string[];
  steps: JobStep[];
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
