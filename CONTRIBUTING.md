# Contributing to blacksmith-mcp

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/grahamnotgrant/blacksmith-mcp.git
   cd blacksmith-mcp
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   ```bash
   export BLACKSMITH_SESSION_COOKIE="your-cookie"
   export BLACKSMITH_ORG="your-org"
   ```

4. Build and test:
   ```bash
   pnpm build
   pnpm test
   ```

## Making Changes

1. Create a branch for your feature or fix
2. Make your changes
3. Run lint and tests:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
4. Submit a pull request

## Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Run `pnpm format` before committing

## Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Test with MCP Inspector
npx @anthropic/mcp-inspector node dist/index.js
```

## Adding New Tools

1. Create a new file in `src/tools/` (e.g., `cache.ts`)
2. Define the Zod schema for input validation
3. Implement the handler function
4. Register the tool in `src/tools/index.ts`
5. Add tests in `tests/tools/`

Example:

```typescript
// src/tools/cache.ts
import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const getCacheStatsSchema = z.object({
  include_history: z.boolean().optional().describe('Include usage history'),
});

export async function getCacheStats(
  client: BlacksmithClient,
  args: z.infer<typeof getCacheStatsSchema>
) {
  return client.getCacheStats(args.include_history);
}
```

## Release Process

Releases are automated via GitHub Actions:

1. Update version in `package.json`
2. Create a git tag: `git tag v0.2.0`
3. Push the tag: `git push origin v0.2.0`
4. GitHub Actions will build and publish to npm

## Questions?

Open an issue or start a discussion on GitHub.
