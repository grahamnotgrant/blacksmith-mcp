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
  // API returns array of repository cache summaries
  const repos = await client.getCacheStats(args.include_history ?? false);

  // Calculate totals from repository data
  const totalGb = repos.reduce((sum, r) => sum + r.usage_total_gbs, 0);
  const totalEntries = repos.reduce((sum, r) => sum + r.num_entries, 0);

  const formatSize = (gb: number): string => {
    if (gb < 0.001) return `${(gb * 1024 * 1024).toFixed(0)} KB`;
    if (gb < 1) return `${(gb * 1024).toFixed(1)} MB`;
    return `${gb.toFixed(2)} GB`;
  };

  return {
    summary: {
      total_size: formatSize(totalGb),
      total_size_gb: totalGb,
      total_entries: totalEntries,
      repository_count: repos.length,
    },
    repositories: repos
      .sort((a, b) => b.usage_total_gbs - a.usage_total_gbs)
      .slice(0, 10)
      .map(repo => ({
        name: repo.name,
        size: formatSize(repo.usage_total_gbs),
        size_gb: repo.usage_total_gbs,
        entries: repo.num_entries,
        usage_percent: repo.usage_total_percentage,
      })),
    insight: repos.length === 0
      ? 'No cache data found. Cache may not be configured or no entries exist yet.'
      : `${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} using ${formatSize(totalGb)} cache storage.`,
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

  // API returns size in MB
  const formatSize = (mb: number): string => {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
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

  // API returns {data: CacheEntry[]}
  const entries = response.data ?? [];
  const totalMb = entries.reduce((sum, e) => sum + e.size, 0);

  return {
    summary: {
      repository: args.repository,
      total_entries: entries.length,
      total_size: formatSize(totalMb),
    },
    entries: entries.map(entry => ({
      key: entry.key.length > 60 ? entry.key.substring(0, 60) + '...' : entry.key,
      scope: entry.scope,
      size: formatSize(entry.size),
      architecture: entry.arch,
      last_hit: formatTimeAgo(entry.lastHitTime),
    })),
    insight: entries.length === 0
      ? 'No cache entries found for this repository.'
      : `${entries.length} cache entries totaling ${formatSize(totalMb)}. Most recent hit: ${formatTimeAgo(entries[0]?.lastHitTime)}.`,
  };
}
