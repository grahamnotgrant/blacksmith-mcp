#!/usr/bin/env node
/**
 * Blacksmith MCP Server
 *
 * An MCP server for Blacksmith CI analytics.
 * https://github.com/grahamnotgrant/blacksmith-mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('Starting Blacksmith MCP server');

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('Blacksmith MCP server running');
}

main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
