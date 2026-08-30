import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  acceptFriend,
  declineFriend,
  fetchFriends,
  removeFriend,
  requestFriend,
} from './api';
import type { Friends } from './api';
import { onSocial, onSocialReconnect } from './socket';

/**
 * Who this user knows, kept in step with the server.
 *
 * The hook is the same shape as `useGoals` and `useRoomStyle` next door: load
 * once, hold the server's answer, and let each mutation *replace* it with the
 * answer that mutation returned. That last part is why every friend route hands
 * back the whole `FriendsView` rather than the row that changed — accepting a
 * request moves a row between two lists, and a client reconstructing that
 * itself would be wrong the first time two tabs were open.
 *
 * There is no optimistic update anywhere in here, deliberately. A friendship is
 * a fact about two people and only one of them is in this browser; showing
 * "friends" before the server has agreed is showing somebody a relationship
 * that may not exist.
 *
 * ## Staying fresh
 *
 * Two triggers, and neither of them is a poll:
 *
 *   `friends:changed`   the other person did something — sent a request,
 *                       accepted one, unfriended. The event carries no payload
 *                       at all; it is a nudge to re-read, so the socket can
 *                       never tell somebody they have a friend they do not.
 *   reconnect           a socket that dropped missed every nudge in between, so
 *                       coming back re-reads unconditionally.
 */
export interface UseFriends {
  friends: Friends;
  loading: boolean;
  error: string | null;
  /** Ask somebody, by id or by the name typed into the search box. */
  add: (target: { userId: string } | { username: string }) => Promise<boolean>;
  accept: (requestId: string) => Promise<boolean>;
  decline: (requestId: string) => Promise<boolean>;
  /** Unfriend, or take back a request. */
  remove: (userId: string) => Promise<boolean>;
  refresh: () => void;
}

const EMPTY: Friends = { friends: [], incoming: [], outgoing: [] };

export function useFriends(): UseFriends {
  const [friends, setFriends] = useState<Friends>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(() => setToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await fetchFriends(controller.signal);
        if (controller.signal.aborted) return;
        setFriends(next);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (!(cause instanceof ApiError && cause.isUnauthorized)) {
          setError('Your friends could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token]);

  // The nudge, and the catch-up after a dropped connection.
  useEffect(() => {
    const stopChanged = onSocial('friends:changed', refresh);
    const stopReconnect = onSocialReconnect(refresh);

    return () => {
      stopChanged();
      stopReconnect();
    };
  }, [refresh]);

  /**
   * Run a mutation and take its answer as the new truth.
   *
   * One wrapper for all four, because all four have the same three outcomes —
   * the server's new picture, a refusal worth showing, or a network failure —
   * and writing that out four times is how three of them end up subtly
   * different.
   */
  const run = useCallback(async (action: () => Promise<Friends>): Promise<boolean> => {
    setError(null);

    try {
      const next = await action();
      if (alive.current) setFriends(next);
      return true;
    } catch (cause) {
      if (alive.current) {
        setError(
          cause instanceof ApiError ? cause.message : 'That could not be done just now.',
        );
      }
      return false;
    }
  }, []);

  return {
    friends,
    loading,
    error,
    add: useCallback((target) => run(() => requestFriend(target)), [run]),
    accept: useCallback((requestId) => run(() => acceptFriend(requestId)), [run]),
    decline: useCallback((requestId) => run(() => declineFriend(requestId)), [run]),
    remove: useCallback((userId) => run(() => removeFriend(userId)), [run]),
    refresh,
  };
}
