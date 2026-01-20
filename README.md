# Blacksmith MCP

[![npm version](https://img.shields.io/npm/v/blacksmith-mcp.svg)](https://www.npmjs.com/package/blacksmith-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

An MCP server that connects Claude to your [Blacksmith CI](https://blacksmith.sh) data. Query workflow runs, analyze test failures, detect flaky tests, and monitor usage—all through natural conversation.

## Why?

Debugging CI failures usually means clicking through dashboards, copying run IDs, and piecing together information across multiple pages. With this MCP, you can just ask:

- *"Why did the last CI run fail?"*
- *"Which tests are flaky this week?"*
- *"Compare test failures between main and my PR"*
- *"What's using the most cache storage?"*

Claude handles the API calls and gives you actionable insights.

## Quick Start

**Zero-config if you're logged into Blacksmith in Chrome:**

```bash
# Add to Claude Code
claude mcp add blacksmith -- npx blacksmith-mcp

# Set your org (run once)
export BLACKSMITH_ORG="your-org-name"
```

The MCP automatically extracts your session from Chrome cookies. No manual token copying needed.

## Installation

### Option 1: Claude Code CLI

```bash
claude mcp add blacksmith -- npx blacksmith-mcp
```

### Option 2: Project Configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "blacksmith": {
      "type": "stdio",
      "command": "npx",
      "args": ["blacksmith-mcp"],
      "env": {
        "BLACKSMITH_ORG": "your-org-name"
      }
    }
  }
}
```

### Option 3: Global Install

```bash
npm install -g blacksmith-mcp
```

## Configuration

### Authentication

**Automatic (recommended):** Log into [app.blacksmith.sh](https://app.blacksmith.sh) in Chrome. The MCP extracts your session cookie automatically.

**Manual:** Set `BLACKSMITH_SESSION_COOKIE` environment variable with your session cookie value.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLACKSMITH_ORG` | Yes | Your Blacksmith organization name |
| `BLACKSMITH_SESSION_COOKIE` | No | Session cookie (auto-extracted from Chrome if not set) |

## Available Tools

### Workflow Runs

| Tool | Description |
|------|-------------|
| `list_runs` | List workflow runs with filters (status, branch, workflow, actor, PR) |
| `get_run` | Get run details including all jobs |
| `list_jobs` | List jobs for a workflow run |
| `get_job` | Get job details (steps, timing, runner info) |
| `get_job_logs` | Get raw log output for a job |

### Test Analytics

| Tool | Description |
|------|-------------|
| `get_job_tests` | Get all test results for a job |
| `get_failed_tests` | Get failed tests with full error messages |
| `get_failures_by_pattern` | Group failures by error pattern (e.g., "Cannot read properties") |
| `compare_test_runs` | Compare failures between two runs (find regressions) |
| `get_flaky_tests` | Detect tests that fail intermittently |
| `get_slow_tests` | Find tests exceeding duration threshold |
| `get_test_history` | Track a specific test's pass/fail history |
| `get_trends` | Analyze trends: duration, failure rate, test count |

### Usage & Billing

| Tool | Description |
|------|-------------|
| `get_current_usage` | Current core usage (active vs max) |
| `get_invoice_amount` | Current billing period amount |
| `get_usage_summary` | Billable minutes vs free tier |
| `get_cache_stats` | Cache size, entries by repository |
| `get_cache_entries` | Detailed cache entries for a repo |

### Organization

| Tool | Description |
|------|-------------|
| `list_orgs` | List accessible organizations |
| `get_org_status` | Org status (personal, onboarded, region) |
| `search_logs` | Search logs across all jobs |

## Example Conversations

### Debug a Failed Run

> **You:** Why did the last CI run fail?
>
> **Claude:** *Uses `list_runs(status="failure", limit=1)` then `get_failed_tests`*
>
> The last run failed with 34 test failures. The main issues are:
> - **Connection timeout** (12 tests) - Tests in `api/` are timing out connecting to the test database
> - **Undefined property** (8 tests) - `user.settings.theme` is undefined in the new dark mode code
> - **Assertion failures** (14 tests) - Snapshot mismatches in UI components

### Find Flaky Tests

> **You:** Which tests are flaky?
>
> **Claude:** *Uses `get_flaky_tests(days=7, min_runs=5)`*
>
> Found 3 flaky tests:
> | Test | Flake Rate | Pattern |
> |------|------------|---------|
> | `should handle concurrent requests` | 40% (4/10 runs) | Fails on CI, passes locally |
> | `renders loading state` | 20% (2/10 runs) | Race condition with setTimeout |
> | `validates auth token` | 30% (3/10 runs) | Intermittent network timeout |

### Compare Branches

> **You:** Did my PR introduce new test failures?
>
> **Claude:** *Uses `compare_test_runs` with PR run vs base branch*
>
> Your PR introduced 2 new failures:
> - `UserProfile.test.tsx`: "Cannot read property 'avatar' of undefined"
> - `api/users.test.ts`: Expected 200, got 404
>
> 5 previously failing tests now pass (nice!).

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Development mode (watch)
pnpm dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### Session Expired

If you see `SESSION_EXPIRED`, your Blacksmith session has expired. Simply log back into [app.blacksmith.sh](https://app.blacksmith.sh) in Chrome and retry.

### Cookie Extraction Failed

The automatic cookie extraction requires:
- macOS with Chrome installed
- Being logged into Blacksmith in Chrome
- Chrome not running with a locked profile

If it fails, set `BLACKSMITH_SESSION_COOKIE` manually.

### No Organization Set

Run `list_orgs` to see available organizations, then set `BLACKSMITH_ORG` to your org name.

## API Notes

This MCP uses Blacksmith's internal web API, which is undocumented. The API was reverse-engineered from the Blacksmith web app and may change without notice.

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.
