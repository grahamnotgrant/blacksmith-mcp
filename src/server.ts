/**
 * MCP server setup for Blacksmith.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger.js';
import { formatErrorResponse } from './utils/errors.js';
import { createClientFromEnv, type BlacksmithClient } from './client.js';
import { getToolDefinitions, executeTool } from './tools/index.js';

export function createServer(): Server {
  const server = new Server(
    {
      name: 'blacksmith-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  let client: BlacksmithClient | null = null;

  /**
   * Get or create the Blacksmith client.
   * Lazily initialized to allow server startup without env vars for --help etc.
   */
  function getClient(): BlacksmithClient {
    if (!client) {
      client = createClientFromEnv();
      logger.info('Blacksmith client initialized');
    }
    return client;
  }

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Listing tools');
    return {
      tools: getToolDefinitions(),
    };
  });

  // Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Executing tool: ${name}`, args);

    try {
      const result = await executeTool(getClient(), name, args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(`Tool ${name} failed`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formatErrorResponse(error), null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
