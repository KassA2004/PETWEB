/**
 * Talking to the social endpoints.
 *
 * Thin, like `features/goals/api.ts` and for the same reason: every interesting
 * decision here — who may be messaged, whether a park has room, which memories
 * a visitor sees — is the server's, and a second copy on this side would give
 * the product two answers to the same question.
 *
 * The split with `./socket.ts` is worth stating, because it is the shape the
 * brief asks for and it is easy to get backwards:
 *
 * ```text
 *   REST (this file)     things that are TRUE: who my friends are, what was
 *                        said, what somebody's room looks like. Asked for.
 *   socket (./socket.ts) things that HAPPEN: somebody arrived, somebody spoke,
 *                        two creatures greeted each other. Pushed.
 * ```
 *
 * Chat history lives here rather than on the socket because "what did I miss"
 * is a page of stored rows, not an event — and a client that has been offline
 * for an hour catches up by asking for them, which is the whole reason
 * refreshing does not empty the window.
 */

import { apiRequest } from '../../lib/api';
import type { UserProgress } from '../../lib/progress';
import type { Memory } from '../memories/api';

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/** A creature, as anybody but its owner sees it. */
export interface PublicPet {
  id: string;
  name: string;
  species: string;
  /** Unvalidated. Pass it through `createPetAppearance` before drawing. */
  appearanceData: unknown;
}

export type RelationshipState =
  | 'self'
  | 'none'
  | 'requested'
  | 'incoming'
  | 'friends'
  | 'declined';

/**
 * Somebody else.
 *
 * Deliberately not a profile. There is no bio, no follower count and no post
 * list, because the product's answer to "who is this" is *their creature and
 * the room it lives in* (project-overview.md §12).
 */
export interface PublicUser {
  id: string;
  username: string;
  pet: PublicPet | null;
  /**
   * What they have done: minutes focused, goals finished, memories shared.
   *
   * The stats tab on a visit, and the only thing this product will say about
   * somebody beyond their creature and their room. It arrives with the profile
   * rather than on a request of its own, because the server reads all three off
   * the same row it was already reading for the username.
   */
  progress: UserProgress;
  /** The same number as `progress.memoriesShared`, under its older name. */
  publicMemories: number;
  relationship: RelationshipState;
  /** The pending request between us, so a result row can offer Accept. */
  requestId: string | null;
}

/*
 * `/users/me` is described in `features/progress/api.ts`, and re-exported here.
 *
 * It moved because the dashboard needs the progress half of that response on
 * load, and everything in this file sits behind the lazily-loaded social chunk
 * — reaching in here for it would have pulled `socket.io-client`'s neighbours
 * into the entry bundle to fetch three integers. One description of the
 * endpoint, importable from either side.
 */
export { fetchMe, setUsername } from '../progress/api';
export type { Me } from '../progress/api';

/**
 * Find people whose username starts with this.
 *
 * Prefix, not substring, and that is the server's decision rather than a
 * limitation: substring search over usernames is an enumeration tool, and the
 * feature is "find the person whose name you know".
 */
export function searchUsers(query: string, signal?: AbortSignal): Promise<PublicUser[]> {
  return apiRequest<PublicUser[]>(`/users/search?q=${encodeURIComponent(query)}`, { signal });
}

export function fetchProfile(userId: string, signal?: AbortSignal): Promise<PublicUser> {
  return apiRequest<PublicUser>(`/users/${userId}`, { signal });
}

/**
 * Somebody's public memories.
 *
 * The private ones are not filtered out here — they are never fetched. The
 * server's query has the visibility in its `where`, which is the entire
 * difference between a visibility feature and a hidden field.
 */
export function fetchPublicMemories(
  userId: string,
  signal?: AbortSignal,
): Promise<Memory[]> {
  return apiRequest<Memory[]>(`/users/${userId}/memories`, { signal });
}

/** Somebody's room: the style, the furniture and the creature living in it. */
export interface VisitableRoom {
  ownerId: string;
  username: string;
  environmentId: string;
  name: string;
  /** The saved style, unvalidated. Pass it through `normalizeRoomStyle`. */
  sceneData: unknown;
  objects: { key: string; type: string; col: number; row: number; definition: unknown }[];
  pet: PublicPet | null;
}

export function fetchVisitableRoom(
  userId: string,
  signal?: AbortSignal,
): Promise<VisitableRoom> {
  return apiRequest<VisitableRoom>(`/users/${userId}/room`, { signal });
}

/* -------------------------------------------------------------------------- */
/* Friends                                                                    */
/* -------------------------------------------------------------------------- */

export interface Friend {
  userId: string;
  username: string;
  pet: PublicPet | null;
  since: string;
}

export interface FriendRequest {
  id: string;
  userId: string;
  username: string;
  pet: PublicPet | null;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

/**
 * The whole picture, always.
 *
 * Every friend route returns all three lists rather than the one row that
 * changed, because accepting a request *moves* a row between lists — and a
 * client handed only the accepted row would have to reconstruct both lists
 * itself, and would be wrong the moment two tabs were open.
 */
export interface Friends {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export function fetchFriends(signal?: AbortSignal): Promise<Friends> {
  return apiRequest<Friends>('/friends', { signal });
}

export function requestFriend(
  target: { userId: string } | { username: string },
  signal?: AbortSignal,
): Promise<Friends> {
  return apiRequest<Friends>('/friends/requests', { method: 'POST', body: target, signal });
}

export function acceptFriend(requestId: string, signal?: AbortSignal): Promise<Friends> {
  return apiRequest<Friends>(`/friends/requests/${requestId}/accept`, {
    method: 'POST',
    signal,
  });
}

export function declineFriend(requestId: string, signal?: AbortSignal): Promise<Friends> {
  return apiRequest<Friends>(`/friends/requests/${requestId}/decline`, {
    method: 'POST',
    signal,
  });
}

/** Unfriend, or take back a request. Keyed by the person, not the relationship. */
export function removeFriend(userId: string, signal?: AbortSignal): Promise<Friends> {
  return apiRequest<Friends>(`/friends/${userId}`, { method: 'DELETE', signal });
}

/* -------------------------------------------------------------------------- */
/* Parks                                                                      */
/* -------------------------------------------------------------------------- */

export interface Park {
  id: string;
  name: string;
  hostId: string;
  hostUsername: string;
  capacity: number;
  isPrivate: boolean;
  occupancy: number;
  createdAt: string;
}

export function fetchParks(signal?: AbortSignal): Promise<Park[]> {
  return apiRequest<Park[]>('/parks', { signal });
}

/**
 * Open a park.
 *
 * Creating is REST; *joining* is the socket, and the split is deliberate — a
 * REST join would hold a slot for a browser that closed during the request.
 * See the parks controller for the longer version.
 */
export function createPark(
  input: { name: string; capacity: number; isPrivate: boolean; passcode?: string },
  signal?: AbortSignal,
): Promise<Park> {
  return apiRequest<Park>('/parks', { method: 'POST', body: input, signal });
}

export interface ParkMessageRecord {
  id: string;
  parkId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: string;
}

/** What was said before you arrived, or while you were disconnected. */
export function fetchParkMessages(
  parkId: string,
  before?: string,
  signal?: AbortSignal,
): Promise<ParkMessageRecord[]> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return apiRequest<ParkMessageRecord[]>(`/parks/${parkId}/messages${query}`, { signal });
}

/* -------------------------------------------------------------------------- */
/* Direct messages                                                            */
/* -------------------------------------------------------------------------- */

export interface Conversation {
  id: string;
  userId: string;
  username: string;
  pet: PublicPet | null;
  lastMessageAt: string;
  preview: string | null;
}

export interface DirectMessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  withUserId: string;
  body: string;
  createdAt: string;
}

export function fetchConversations(signal?: AbortSignal): Promise<Conversation[]> {
  return apiRequest<Conversation[]>('/chat/conversations', { signal });
}

export function fetchMessages(
  userId: string,
  before?: string,
  signal?: AbortSignal,
): Promise<DirectMessageRecord[]> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return apiRequest<DirectMessageRecord[]>(
    `/chat/conversations/${userId}/messages${query}`,
    { signal },
  );
}

/**
 * Send a message over HTTP.
 *
 * The fallback path, for a client whose socket is down. It writes the same row
 * through the same service, and the server pushes it to whoever *is* connected
 * — so a dropped connection costs the sender their live echo, not the message.
 */
export function sendMessage(
  userId: string,
  body: string,
  signal?: AbortSignal,
): Promise<DirectMessageRecord> {
  return apiRequest<DirectMessageRecord>(`/chat/conversations/${userId}/messages`, {
    method: 'POST',
    body: { body },
    signal,
  });
}
