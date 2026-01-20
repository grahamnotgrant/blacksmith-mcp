/**
 * Logger that writes to stderr only.
 *
 * CRITICAL: MCP servers using stdio transport MUST NOT use console.log
 * because it corrupts the JSON-RPC message stream on stdout.
 * All logging must go to stderr.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `${prefix} ${entry.message}${dataStr}`;
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    data,
  };
  // CRITICAL: Write to stderr, never stdout
  console.error(formatLog(entry));
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
};
