/**
 * Shared utilities for workflow run handling.
 */

import type { WorkflowRun } from '../types/blacksmith.js';

/**
 * Determine if a workflow run is completed.
 * Uses multiple heuristics since API field names/values can vary.
 */
export function isRunCompleted(run: WorkflowRun): boolean {
  // Check status field for completion indicators
  if (run.status === 'completed') return true;
  // API often puts conclusion values in status field
  if (run.status === 'success' || run.status === 'failure' || run.status === 'cancelled') return true;
  // Check conclusion field - if set to a real value, run is done
  if (run.conclusion && run.conclusion !== 'null') return true;
  // If duration_seconds exists and > 0, run likely completed
  if (run.duration_seconds && run.duration_seconds > 0) return true;
  return false;
}
