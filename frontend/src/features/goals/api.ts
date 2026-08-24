/**
 * Talking to the goal endpoints.
 *
 * Thin on purpose: the interesting decisions — the six-goal cap, what a
 * completion does to a memory — are the server's, and duplicating them here
 * would give the product two answers to the same question. This layer only
 * knows the shapes.
 */

import { apiRequest } from '../../lib/api';
import type { Affection } from '../focus/api';

export type GoalStatus = 'open' | 'completed';

export interface GoalMemory {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  createdAt: string;
  completedAt: string | null;
  /** What the user chose to remember about finishing it, if anything. */
  memory: GoalMemory | null;
}

/**
 * What finishing one hands back: the goal, plus what it did to the creature.
 *
 * The gain is the server's number, not a subtraction done here. Affection gains
 * are scaled by how much room is left above the current value, so only the code
 * that applied it knows what the completion was actually worth — and the
 * celebration prints it.
 */
export interface GoalCompletion extends Goal {
  affection: Affection;
  /** Whole percentage points, for "+5 Happiness". Never negative. */
  affectionGained: number;
}

export interface GoalList {
  items: Goal[];
  openCount: number;
  /** The cap, from the server, so the interface never hard-codes it. */
  maxOpen: number;
}

/** What the user optionally attaches when they finish something. */
export interface CompletionMemory {
  title?: string;
  description?: string;
  /** A path from `uploadImage`, never a URL the client invented. */
  imageUrl?: string;
}

export function fetchGoals(signal?: AbortSignal): Promise<GoalList> {
  return apiRequest<GoalList>('/goals', { signal });
}

export function createGoal(
  input: { title: string; description?: string },
  signal?: AbortSignal,
): Promise<Goal> {
  return apiRequest<Goal>('/goals', { method: 'POST', body: input, signal });
}

/**
 * Finish a goal.
 *
 * Safe to retry: the server treats completing an already-completed goal as the
 * same request arriving twice and returns the first result, so a client that
 * never saw its response can ask again without making a second memory.
 */
export function completeGoal(
  goalId: string,
  memory?: CompletionMemory,
  signal?: AbortSignal,
): Promise<GoalCompletion> {
  return apiRequest<GoalCompletion>(`/goals/${goalId}/complete`, {
    method: 'POST',
    body: memory ? { memory } : {},
    signal,
  });
}

export function reopenGoal(goalId: string, signal?: AbortSignal): Promise<Goal> {
  return apiRequest<Goal>(`/goals/${goalId}/reopen`, { method: 'POST', signal });
}

export function deleteGoal(goalId: string, signal?: AbortSignal): Promise<void> {
  return apiRequest<void>(`/goals/${goalId}`, { method: 'DELETE', signal });
}
