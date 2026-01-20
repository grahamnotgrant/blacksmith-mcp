/**
 * Usage and billing tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const getCurrentUsageSchema = z.object({});

export const getInvoiceAmountSchema = z.object({});

export const getUsageSummarySchema = z.object({});

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
