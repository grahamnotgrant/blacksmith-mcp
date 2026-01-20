# Blacksmith MCP Testing Checklist

Testing all MCP tools systematically. This file tracks progress across Claude Code restarts.

## Test Data
- **Org**: Votion-Platform
- **Run ID**: 21180792852 (CI Pipeline from 2026-01-20 17:18)
- **Run ID (failed)**: 21166447472 (CI Pipeline failure from 2026-01-20 09:34)
- **Job ID (test job)**: 60922273681 (Test Blacksmith/Self-Hosted - has 10,700 tests)
- **Job ID (failed job)**: 60872258176 (Test Blacksmith/Self-Hosted - 34 failed tests)
- **Job ID (select runner)**: 60922258797 (select-runner-build / select)

## Tools Status

### Organization Tools
- [x] **list_orgs** - PASSED
  - Returns org list with active_org and admin status

- [x] **get_org_status** - PASSED
  - Returns hasOnboarded and runnerRegion

### Usage & Billing Tools
- [x] **get_current_usage** - PASSED
  - Fixed: Added null safety for division by zero

- [x] **get_invoice_amount** - PASSED
  - Fixed: Added USD default for missing currency field
  - Returns `$0.00 USD` correctly now

- [x] **get_usage_summary** - PASSED
  - Returns billable_minutes: 1652, free_minutes: 3000
  - Calculates remaining_free_minutes: 1348, overage_minutes: 0
  - Shows usage_percent: 55%, status: within_free_tier

### Workflow Run Tools
- [x] **list_runs** - PASSED
  - Fixed: Date format conversion to ISO 8601
  - Fixed: Handle array response (not wrapped object)
  - Fixed: Default to last 7 days when no dates provided
  - Returns 50 runs correctly

- [x] **get_run** - PASSED
  - Fixed: Added null safety for repository/actor fields
  - Returns workflow_name, repository, and jobs array
  - Jobs embedded in response (6 jobs for test run)

- [x] **list_jobs** - PASSED
  - Returns all jobs for a run with full step details
  - Each job has id, name, status, conclusion, runtime_seconds, labels, steps

### Job Tools
- [x] **get_job** - PASSED
  - Fixed: Added null safety for steps array
  - Fixed: Unwrap {job: ...} response
  - Returns full job detail with 23 steps including timing

- [x] **get_job_logs** - PARTIAL (returns empty)
  - Fixed: Parse NDJSON streaming format
  - Note: Returns empty logs - may be data retention/availability issue
  - API might require vm_id or logs may expire

### Test Results Tools
- [x] **get_job_tests** - PASSED
  - Fixed: Added null safety for tests array
  - Returns massive test results: 10,700 total tests
  - Shows summary (passed: 10,283, failed: 417, skipped: 0)
  - Organized by test suites with individual test details

- [x] **get_failed_tests** - PASSED
  - Fixed: Added null safety for tests array and sha field
  - Returns 34 failed tests with full error messages and stack traces
  - Includes commit context (sha, message, branch, pr_number)

## Issues Found & Fixed

| Tool | Issue | Fix | Status |
|------|-------|-----|--------|
| list_runs | 422 error - dates required | Auto-generate default 7-day range | Fixed |
| list_runs | Empty response | Convert YYYY-MM-DD to ISO 8601 format | Fixed |
| list_runs | Expected {runs, total_count} | Handle raw array response | Fixed |
| get_invoice_amount | "undefined 0.00" | Default currency to USD | Fixed |
| get_current_usage | Division by zero possible | Add null check for max_cores | Fixed |
| get_run | Crash on repository.full_name | Add optional chaining | Fixed |
| get_run | Missing jobs data | API returns jobs array in response | Fixed - now exposed |
| get_job | Returns empty {} | API returns {job: Job} wrapped | Fixed - unwrap response |
| get_job | Crash on steps.map | Add optional chaining | Fixed |
| get_job_logs | JSON parse error | API returns NDJSON (streaming) | Fixed - parse line by line |
| get_job_logs | Empty logs returned | Unknown - possible data retention | Investigate |
| get_job_tests | Crash on tests array | Add null coalescing | Fixed |
| get_failed_tests | Crash on sha.substring | Add optional chaining | Fixed |

## Summary

**All 12 tools tested:**
- 11 fully working
- 1 partial (get_job_logs returns empty - may be API limitation)

**New tools added:**
- list_jobs - Lists all jobs for a run
- get_usage_summary - Shows billable vs free minutes

**Key API discoveries:**
- Dates MUST be ISO 8601 format: `2026-01-20T00:00:00Z`
- Runs endpoint returns raw array, not wrapped object
- Invoice only returns `{amount: 0}`, no currency/period fields
- Run response uses `repository_name` not `repository.full_name`
- Job logs endpoint may require vm_id or have data retention limits
- Test results can be massive (10,700+ tests = 3.3MB response)
