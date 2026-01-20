/**
 * Usage and billing tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const getCurrentUsageSchema = z.object({});

export const getInvoiceAmountSchema = z.object({});

export const getUsageSummarySchema = z.object({});

export const getCacheStatsSchema = z.object({
  include_history: z
    .boolean()
    .optional()
    .describe('Include historical cache data (default: false)'),
});

export const getCacheEntriesSchema = z.object({
  repository: z.string().describe('Repository name - try short name first (e.g., "votion"), or full name (e.g., "Votion-Platform/votion") if needed'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of entries to return (default: 20)'),
});

export async function getCurrentUsage(client: BlacksmithClient) {
  const usage = await client.getCurrentUsage();

  // Handle edge case where max_cores could be 0 or undefined
  const utilizationPercent = usage.max_cores && usage.max_cores > 0
    ? Math.round((usage.current_cores / usage.max_cores) * 100)
    : null;

  return {
    current_cores: usage.current_cores ?? 0,
    max_cores: usage.max_cores ?? 0,
    utilization_percent: utilizationPercent,
    timestamp: usage.timestamp,
  };
}

export async function getInvoiceAmount(client: BlacksmithClient) {
  const invoice = await client.getInvoiceAmount();

  const currency = invoice.currency || 'USD';
  const amountDollars = (invoice.amount / 100).toFixed(2);

  return {
    amount: invoice.amount,
    amount_dollars: parseFloat(amountDollars),
    currency,
    formatted: `$${amountDollars} ${currency}`,
    period: invoice.period_start && invoice.period_end
      ? { start: invoice.period_start, end: invoice.period_end }
      : undefined,
  };
}

export async function getUsageSummary(client: BlacksmithClient) {
  const usage = await client.getUsageSummary();

  const usedMinutes = usage.billable_minutes;
  const freeMinutes = usage.free_minutes;
  const remainingFree = Math.max(0, freeMinutes - usedMinutes);
  const overageMinutes = Math.max(0, usedMinutes - freeMinutes);

  return {
    billable_minutes: usedMinutes,
    free_minutes: freeMinutes,
    remaining_free_minutes: remainingFree,
    overage_minutes: overageMinutes,
    usage_percent: Math.round((usedMinutes / freeMinutes) * 100),
    status: usedMinutes >= freeMinutes ? 'over_limit' : 'within_free_tier',
  };
}

export async function getCacheStats(
  client: BlacksmithClient,
  args: { include_history?: boolean }
) {
  const stats = await client.getCacheStats(args.include_history ?? false);

  // Convert bytes to human-readable
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const repositories = stats.repositories ?? [];

  return {
    summary: {
      total_size: formatBytes(stats.total_size_bytes ?? 0),
      total_size_bytes: stats.total_size_bytes ?? 0,
      total_entries: stats.total_entries ?? 0,
      hit_rate_percent: Math.round((stats.hit_rate ?? 0) * 100),
    },
    repositories: repositories
      .sort((a, b) => b.size_bytes - a.size_bytes)
      .slice(0, 10)
      .map(repo => ({
        name: repo.name,
        size: formatBytes(repo.size_bytes),
        size_bytes: repo.size_bytes,
        entries: repo.entries,
      })),
    insight: (stats.hit_rate ?? 0) >= 0.8
      ? `Cache hit rate is excellent (${Math.round((stats.hit_rate ?? 0) * 100)}%).`
      : (stats.hit_rate ?? 0) >= 0.5
        ? `Cache hit rate is moderate (${Math.round((stats.hit_rate ?? 0) * 100)}%). Consider optimizing cache keys.`
        : repositories.length === 0
          ? 'No cache data found. Cache may not be configured or no entries exist yet.'
          : `Cache hit rate is low (${Math.round((stats.hit_rate ?? 0) * 100)}%). Review your caching strategy.`,
  };
}

export async function getCacheEntries(
  client: BlacksmithClient,
  args: { repository: string; limit?: number }
) {
  const limit = args.limit ?? 20;
  const response = await client.getCacheEntries(args.repository, {
    perPage: limit,
  });

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatTimeAgo = (timestamp: string | undefined): string => {
    if (!timestamp) return 'unknown';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'unknown';
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const entries = response.entries ?? [];
  const totalSize = entries.reduce((sum, e) => sum + e.size_bytes, 0);

  return {
    summary: {
      repository: args.repository,
      total_entries: response.total_count ?? entries.length,
      showing: entries.length,
      total_size: formatBytes(totalSize),
    },
    entries: entries.map(entry => ({
      key: entry.key.length > 60 ? entry.key.substring(0, 60) + '...' : entry.key,
      scope: entry.scope,
      size: formatBytes(entry.size_bytes),
      architecture: entry.architecture,
      last_hit: formatTimeAgo(entry.last_hit_time),
    })),
    insight: entries.length === 0
      ? 'No cache entries found for this repository.'
      : `${entries.length} cache entries totaling ${formatBytes(totalSize)}. Most recent hit: ${formatTimeAgo(entries[0]?.last_hit_time ?? '')}.`,
  };
}
