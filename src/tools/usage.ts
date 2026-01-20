/**
 * Usage and billing tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const getCurrentUsageSchema = z.object({});

export const getInvoiceAmountSchema = z.object({});

export async function getCurrentUsage(client: BlacksmithClient) {
  const usage = await client.getCurrentUsage();

  return {
    current_cores: usage.current_cores,
    max_cores: usage.max_cores,
    utilization_percent: Math.round((usage.current_cores / usage.max_cores) * 100),
    timestamp: usage.timestamp,
  };
}

export async function getInvoiceAmount(client: BlacksmithClient) {
  const invoice = await client.getInvoiceAmount();

  return {
    amount: invoice.amount,
    currency: invoice.currency,
    formatted: `${invoice.currency} ${(invoice.amount / 100).toFixed(2)}`,
    period: {
      start: invoice.period_start,
      end: invoice.period_end,
    },
  };
}
