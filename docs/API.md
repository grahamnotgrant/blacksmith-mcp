# API Reference

This document describes all available tools in the Blacksmith MCP server.

## Organization Tools

### `list_orgs`

List all Blacksmith organizations accessible to your account.

**Parameters:** None

**Returns:**
```json
{
  "organizations": [
    { "login": "my-org", "name": "My Organization", "id": 12345 }
  ],
  "count": 1,
  "hint": "Set BLACKSMITH_ORG environment variable..."
}
```

---

### `get_org_status`

Get the status of the current organization.

**Parameters:** None

**Returns:**
```json
{
  "isPersonalOrg": false,
  "hasOnboarded": true,
  "runnerRegion": "us-east-1"
}
```

---

## Workflow Run Tools

### `list_runs`

List recent workflow runs.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `start_date` | string (optional) | Start date (YYYY-MM-DD) |
| `end_date` | string (optional) | End date (YYYY-MM-DD) |
| `limit` | number (optional) | Maximum runs to return |

**Returns:**
```json
{
  "runs": [
    {
      "id": 12345,
      "name": "CI",
      "branch": "main",
      "sha": "abc1234",
      "status": "completed",
      "conclusion": "success",
      "event": "push",
      "repository": "owner/repo",
      "actor": "username",
      "started_at": "2026-01-19T10:00:00Z"
    }
  ],
  "total_count": 100
}
```

---

### `get_run`

Get details of a specific workflow run.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | string (required) | GitHub Actions workflow run ID |

**Returns:** Full workflow run details including all metadata.

---

## Job Tools

### `get_job`

Get details of a specific job.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | string (required) | GitHub Actions workflow run ID |
| `job_id` | string (required) | GitHub Actions job ID |

**Returns:**
```json
{
  "id": 98765,
  "run_id": 12345,
  "name": "build",
  "status": "completed",
  "conclusion": "success",
  "runner_name": "blacksmith-4vcpu",
  "runner_group": "default",
  "labels": ["blacksmith-4vcpu"],
  "started_at": "2026-01-19T10:00:00Z",
  "completed_at": "2026-01-19T10:05:00Z",
  "steps": [
    {
      "number": 1,
      "name": "Checkout",
      "status": "completed",
      "conclusion": "success"
    }
  ]
}
```

---

### `get_job_logs`

Get the logs for a specific job.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `job_id` | string (required) | GitHub Actions job ID |
| `limit` | number (optional) | Max log lines (default: 1000) |
| `vm_id` | string (optional) | VM ID for the job |

**Returns:**
```json
{
  "job_id": "98765",
  "line_count": 500,
  "logs": "2026-01-19T10:00:00Z Starting job..."
}
```

---

## Test Tools

### `get_job_tests`

Get test results for a job.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | string (required) | GitHub Actions workflow run ID |
| `job_id` | string (required) | GitHub Actions job ID |
| `status` | string (optional) | Filter: "pass", "fail", or "skip" |

**Returns:**
```json
{
  "summary": {
    "total": 100,
    "passed": 95,
    "failed": 3,
    "skipped": 2
  },
  "suites": [
    {
      "name": "Unit Tests",
      "test_count": 50,
      "tests": [
        {
          "id": "abc-123",
          "name": "should work correctly",
          "status": "pass",
          "duration_seconds": 0.5,
          "logs": null
        }
      ]
    }
  ]
}
```

---

### `get_failed_tests`

Get only failed tests for a job with error details.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | string (required) | GitHub Actions workflow run ID |
| `job_id` | string (required) | GitHub Actions job ID |

**Returns:**
```json
{
  "failed_count": 3,
  "tests": [
    {
      "id": "abc-123",
      "name": "should handle edge case",
      "suite": "Unit Tests",
      "duration_seconds": 0.1,
      "error": "Expected true but got false\n  at test.ts:42",
      "commit": {
        "sha": "abc1234",
        "message": "Add new feature",
        "branch": "main",
        "pr_number": 123
      }
    }
  ]
}
```

---

## Usage Tools

### `get_current_usage`

Get current core usage snapshot.

**Parameters:** None

**Returns:**
```json
{
  "current_cores": 8,
  "max_cores": 32,
  "utilization_percent": 25,
  "timestamp": "2026-01-19T10:00:00Z"
}
```

---

### `get_invoice_amount`

Get the current billing period invoice amount.

**Parameters:** None

**Returns:**
```json
{
  "amount": 5000,
  "currency": "USD",
  "formatted": "USD 50.00",
  "period": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  }
}
```

---

## Error Responses

All tools may return error responses:

```json
{
  "error": "SESSION_EXPIRED",
  "message": "Blacksmith session cookie expired. Please refresh your cookie.",
  "hint": "Extract a fresh session cookie from your browser..."
}
```

Common error codes:
- `SESSION_EXPIRED` - Cookie needs to be refreshed
- `CONFIGURATION_ERROR` - Missing required environment variables
- `API_ERROR` - Blacksmith API returned an error
- `UNKNOWN_ERROR` - Unexpected error occurred
