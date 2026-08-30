# 10 — REALTIME EVENTS — **superseded by [13](./13-social-endpoints.md)**

**Namespace:** `ws://localhost:3000/world` — built as `/social`
**Module:** `RealtimeModule`
**Status:** the feature was requested and built. This document is kept as the
design it was built against, not as a description of what exists.

> **Read [13-social-endpoints.md](./13-social-endpoints.md) for the real thing.**
>
> This page was written so that shipping realtime later would not require
> redesigning the REST API. It did not, and that is the one claim here worth
> keeping: every REST route the social layer needed was either already
> specified or a clean addition.
>
> What it got right, and the implementation kept: the socket authenticates from
> the same session cookie as REST; §1's list of what must never cross the
> boundary; and §5's judgement that Redis stays out until more than one process
> serves sockets.
>
> What it got wrong, and why:
>
> - **The namespace.** `/world` described visiting an environment. What was
>   actually built is broader — parks, friends, presence and two kinds of chat
>   over one connection — so it is `/social`.
> - **`presence:move { x, y }` as a cursor.** The unit of presence turned out
>   to be a *creature*, not a cursor: `park:move { x, z, facing, state }`, in
>   room coordinates, because the thing being synchronised stands on a floor
>   with depth.
> - **`room:join { environmentId }`.** Visiting somebody's room is a plain REST
>   read (`GET /users/:userId/room`) and needs no socket at all — a visitor
>   watches a creature that is being simulated in their own browser. The socket
>   is for *parks*, which are the places two people are in at once.
> - **§6's sharing model.** The proposal was `Environment.visibility`. A room
>   turned out not to need one: a room is visitable, its *memories* are what
>   carry visibility. That column was never added.

WebSockets are in the stack (`techStack.md`) but exist for shared environments and
presence — a future feature (`project-overview.md` §12). The MVP is single-user and
must work entirely over REST.

> `AGENTS.md`: *"Do not implement future features unless explicitly requested."*
> This document exists so the future feature does not require redesigning the REST API.

---

## 1. What must NOT go over WebSockets

| Not this | Because |
|----------|---------|
| Per-frame animation data | The simulation is client-side; the server never sees frames (`animation-approach.md` §4) |
| Pet state ticks | `PATCH /pets/:petId/state` snapshots are enough |
| Object drag positions | Persisted on drop via REST |
| Anything the MVP needs | The MVP has no realtime requirement at all |

Realtime carries **other users' presence**, nothing else.

---

## 2. Connection

```text
connect  ws://localhost:3000/world
         cookie: better-auth.session_token=...
```

The gateway authenticates from the same session cookie as REST. An unauthenticated
socket is closed immediately with code `4401`.

---

## 3. Client → server events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ environmentId }` | Enter a visitable environment |
| `room:leave` | `{ environmentId }` | Leave it |
| `presence:move` | `{ x, y }` | Visitor cursor / avatar position (throttled to 10 Hz) |
| `pet:emote` | `{ petId, emote }` | Broadcast a visible reaction |

---

## 4. Server → client events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:state` | `{ visitors: [...], pets: [...] }` | Sent once on join |
| `presence:joined` | `{ userId, username, pet }` | Someone entered |
| `presence:left` | `{ userId }` | Someone left |
| `presence:moved` | `{ userId, x, y }` | Visitor moved |
| `object:changed` | `{ instanceId, x, y, rotation, scale }` | Room edited while others watch |
| `pet:emoted` | `{ petId, emote }` | Another pet reacted |
| `error` | `{ code, message }` | Same error codes as REST |

---

## 5. Redis

Redis is only needed once more than one backend process serves sockets — it backs the
Socket.IO adapter and presence keys (`techStack.md` — Realtime Infrastructure). A
single local process needs no Redis, so it stays out of the initial setup.

---

## 6. Authorization for visiting

Visiting another user's environment requires a sharing model that does not exist in
`InitialDB-plan.md` (no visibility flag, no friendship table). That schema work must be
documented before any of this is built (`AGENTS.md` — *"Do not redesign the database
without documenting the change."*). See `11-schema-additions.md` §6.
