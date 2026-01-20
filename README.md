# blacksmith-mcp

An MCP (Model Context Protocol) server for [Blacksmith CI](https://blacksmith.sh) analytics.

Query your CI/CD data directly from Claude - workflow runs, jobs, test results, usage metrics, and more.

## Installation

```bash
# Run directly with npx
npx blacksmith-mcp

# Or install globally
npm install -g blacksmith-mcp
```

## Configuration

### 1. Get Your Session Cookie

Blacksmith uses session-based authentication. You'll need to extract your session cookie from your browser:

1. Log in to [app.blacksmith.sh](https://app.blacksmith.sh)
2. Open Chrome DevTools (F12)
3. Go to **Application** > **Cookies** > `https://app.blacksmith.sh`
4. Find the cookie named `session`
5. Copy its value

### 2. Set Environment Variables

```bash
# Required: Your session cookie
export BLACKSMITH_SESSION_COOKIE="your-session-cookie-value"

# Optional: Default organization (if you have multiple)
export BLACKSMITH_ORG="your-org-name"
```

### 3. Add to Claude Code

```bash
claude mcp add blacksmith -- npx blacksmith-mcp
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "blacksmith": {
      "type": "stdio",
      "command": "npx",
      "args": ["blacksmith-mcp"],
      "env": {
        "BLACKSMITH_SESSION_COOKIE": "${BLACKSMITH_SESSION_COOKIE}",
        "BLACKSMITH_ORG": "${BLACKSMITH_ORG}"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_orgs` | List all accessible Blacksmith organizations |
| `get_org_status` | Get org status (personal, onboarded, runner region) |
| `list_runs` | List recent workflow runs with optional date filtering |
| `get_run` | Get details of a specific workflow run |
| `get_job` | Get job details including steps and runner info |
| `get_job_logs` | Get raw log output for a job |
| `get_job_tests` | Get test results for a job (with status filtering) |
| `get_failed_tests` | Get only failed tests with error messages |
| `get_current_usage` | Get current core usage snapshot |
| `get_invoice_amount` | Get current billing period amount |

## Example Usage

Once configured, you can ask Claude things like:

- "Show me the last 10 workflow runs"
- "Get the failed tests from run 12345678"
- "What's our current Blacksmith usage?"
- "Show me the logs for job 98765432"

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run in development mode
pnpm dev

# Lint
pnpm lint

# Test
pnpm test

# Test with MCP Inspector
npx @anthropic/mcp-inspector node dist/index.js
```

## Session Cookie Expiration

If you see a `SESSION_EXPIRED` error, your cookie has expired. Extract a new one from your browser and update `BLACKSMITH_SESSION_COOKIE`.

## API Notes

This server uses Blacksmith's internal web API, which is undocumented and may change. The API was reverse-engineered from the Blacksmith web app.

## License

MIT - see [LICENSE](LICENSE)

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
