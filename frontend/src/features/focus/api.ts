/**
 * Talking to the focus endpoints.
 *
 * Thin, like the goals client next door and for the same reason: the
 * interesting decisions — how long a session may be, whether one is already
 * running, what an ending does to the creature — are the server's, and a second
 * copy here would give the product two answers to the same question.
 *
 * The one shape worth understanding is `remainingSeconds`. It is not a
 * deadline. The server sends *how much longer*, worked out from `startedAt +
 * durationMinutes` against its own clock, precisely so no browser ever has to
 * be trusted about what time it is (`useFocus` anchors it to arrival).
 */

import { apiRequest } from '../../lib/api';

export type FocusStatus = 'active' | 'completed' | 'aborted';

export interface FocusSession {
  id: string;
  goalId: string | null;
  durationMinutes: number;
  status: FocusStatus;
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  /** Server-computed. Zero for anything that is no longer running. */
  remainingSeconds: number;
}

/** The six bands, low to high. The pet's behaviour is the real display. */
export type AffectionLevel =
  | 'very-low'
  | 'low'
  | 'neutral'
  | 'happy'
  | 'affectionate'
  | 'very-affectionate';

export interface Affection {
  /** 0..1. Drives the creature. Never shown to the user as a number. */
  value: number;
  level: AffectionLevel;
}

export interface FocusState {
  active: FocusSession | null;
  /**
   * A session whose time ran out while the app was closed.
   *
   * Reported once, so the room can wake the creature and say something rather
   * than the user returning to a room that quietly reset itself.
   */
  justFinished: FocusSession | null;
  affection: Affection;
  /** The durations the interface offers, from the server. */
  presets: number[];
  minMinutes: number;
  maxMinutes: number;
}

export interface FocusResult {
  session: FocusSession;
  affection: Affection;
}

export function fetchFocus(signal?: AbortSignal): Promise<FocusState> {
  return apiRequest<FocusState>('/focus', { signal });
}

export function startFocus(
  input: { goalId: string; durationMinutes: number },
  signal?: AbortSignal,
): Promise<FocusResult> {
  return apiRequest<FocusResult>('/focus/sessions', {
    method: 'POST',
    body: input,
    signal,
  });
}

/**
 * Tell the server the time is up.
 *
 * May be refused with `FOCUS_NOT_FINISHED` when the browser's clock ran fast.
 * That is not an error to show anybody — the caller resynchronises from a fresh
 * `fetchFocus` and keeps counting.
 */
export function completeFocus(
  sessionId: string,
  signal?: AbortSignal,
): Promise<FocusResult> {
  return apiRequest<FocusResult>(`/focus/sessions/${sessionId}/complete`, {
    method: 'POST',
    signal,
  });
}

export function abortFocus(
  sessionId: string,
  signal?: AbortSignal,
): Promise<FocusResult> {
  return apiRequest<FocusResult>(`/focus/sessions/${sessionId}/abort`, {
    method: 'POST',
    signal,
  });
}
