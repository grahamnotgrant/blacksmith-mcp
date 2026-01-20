/**
 * Custom error types for Blacksmith MCP server.
 */

export class BlacksmithError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'BlacksmithError';
  }
}

export class SessionExpiredError extends BlacksmithError {
  constructor() {
    super(
      'Blacksmith session cookie expired. Please refresh your cookie.',
      'SESSION_EXPIRED',
      401
    );
    this.name = 'SessionExpiredError';
  }
}

export class ConfigurationError extends BlacksmithError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class ApiError extends BlacksmithError {
  constructor(message: string, statusCode: number) {
    super(message, 'API_ERROR', statusCode);
    this.name = 'ApiError';
  }
}

/**
 * Format an error for MCP tool response.
 */
export function formatErrorResponse(error: unknown): {
  error: string;
  message: string;
  hint?: string;
} {
  if (error instanceof SessionExpiredError) {
    return {
      error: 'SESSION_EXPIRED',
      message: error.message,
      hint: 'Extract a fresh session cookie from your browser and update BLACKSMITH_SESSION_COOKIE',
    };
  }

  if (error instanceof ConfigurationError) {
    return {
      error: 'CONFIGURATION_ERROR',
      message: error.message,
    };
  }

  if (error instanceof ApiError) {
    return {
      error: 'API_ERROR',
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: 'UNKNOWN_ERROR',
      message: error.message,
    };
  }

  return {
    error: 'UNKNOWN_ERROR',
    message: String(error),
  };
}
