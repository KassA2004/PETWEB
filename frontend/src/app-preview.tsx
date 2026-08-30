/**
 * Scratch harness for the whole dashboard, with a fake backend.
 *
 * Not part of the product, and never built — only `index.html` is a Vite input.
 *
 * The real dashboard sits behind an auth gate, so the signed-in flows cannot be
 * exercised without credentials. This mounts it with `fetch` replaced by a small
 * in-memory server implementing the same routes, backed by `sessionStorage` so
 * that reloading the page genuinely re-reads persisted state through exactly the
 * client code paths the real one uses. That is the part worth having: "does the
 * room come back after a refresh" is a question about the loading flow, and the
 * loading flow does not care whether the rows came from Postgres.
 *
 * The stub enforces the rules the real server enforces — the six-goal cap, the
 * refusal of a made-up `imageUrl` — so a failure here is a client bug rather
 * than a disagreement about what the server would have said.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './features/dashboard/Dashboard';
import './index.css';

/* -------------------------------------------------------------------------- */
/* A very small server                                                        */
/* -------------------------------------------------------------------------- */

interface FocusRow {
  id: string;
  goalId: string;
  durationMinutes: number;
  status: 'active' | 'completed' | 'aborted';
  /** Epoch ms. The stub's clock, like the server's, is the only clock. */
  startedAt: number;
  endedAt: number | null;
}

interface Store {
  goals: Record<string, unknown>[];
  memories: Record<string, unknown>[];
  objects: Record<string, unknown>[];
  sceneData: Record<string, unknown>;
  pets: Record<string, unknown>[];
  activePetId: string | null;
  sessions: FocusRow[];
  affection: number;
  /** Direct messages sent from the preview, so a reload still shows them. */
  sent: Record<string, unknown>[];
}

const KEY = 'petweb.preview.store';
const MAX_OPEN = 6;

function load(): Store {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* fall through to a fresh store */
  }
  return {
    goals: [],
    memories: [],
    objects: [],
    sceneData: {},
    pets: [],
    activePetId: null,
    sessions: [],
    affection: 0.5,
    sent: [],
  };
}

let store = load();

function save() {
  sessionStorage.setItem(KEY, JSON.stringify(store));
}

const uuid = () => crypto.randomUUID();

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

const STORED_PATH = /^\/uploads\/memory\/\d{4}\/\d{2}\/[0-9a-f]{32}\.(png|jpg|webp)$/;


/** The request log, so a test can assert on what the client actually sent. */
const calls: { method: string; path: string; body?: unknown }[] = [];

const deadline = (row: FocusRow) => row.startedAt + row.durationMinutes * 60_000;

/** Six bands, matching `Backend/src/affection/affection.ts`. */
function levelOf(value: number): string {
  if (value >= 0.9) return 'very-affectionate';
  if (value >= 0.74) return 'affectionate';
  if (value >= 0.56) return 'happy';
  if (value >= 0.38) return 'neutral';
  if (value >= 0.2) return 'low';
  return 'very-low';
}

const affectionView = () => ({
  value: store.affection,
  level: levelOf(store.affection),
});

/** `remainingSeconds` is computed here, exactly as the server computes it. */
function sessionView(row: FocusRow): Record<string, unknown> {
  return {
    id: row.id,
    goalId: row.goalId,
    durationMinutes: row.durationMinutes,
    status: row.status,
    startedAt: new Date(row.startedAt).toISOString(),
    endsAt: new Date(deadline(row)).toISOString(),
    endedAt: row.endedAt === null ? null : new Date(row.endedAt).toISOString(),
    remainingSeconds:
      row.status === 'active'
        ? Math.max(0, Math.ceil((deadline(row) - Date.now()) / 1000))
        : 0,
  };
}

function focusView(): Record<string, unknown> | null {
  const running = store.sessions.find((row) => row.status === 'active');
  return running && Date.now() < deadline(running) ? sessionView(running) : null;
}

async function handle(method: string, path: string, body: unknown): Promise<Response> {
  calls.push({ method, path, body });
  const b = (body ?? {}) as Record<string, unknown>;

  // --- pets ---------------------------------------------------------------
  if (path === '/pets' && method === 'GET') {
    return json({ items: store.pets, activePetId: store.activePetId });
  }
  /*
   * Saving a preset, which the Parks tab gates on.
   *
   * A park draws everybody's creature from their saved `Pet` row, so the panel
   * refuses to open one until there is a row — which made the whole
   * park-creation flow unreachable in this harness until the stub could answer
   * this. Enough of a row to satisfy the gate; nothing here pretends to be the
   * real editor's save path.
   */
  if (path === '/pets' && method === 'POST') {
    const input = (body ?? {}) as { name?: string; appearanceData?: unknown };
    const pet = {
      id: `pet-${store.pets.length + 1}`,
      name: input.name ?? 'Blorb',
      species: 'blob',
      appearanceData: input.appearanceData ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.pets.push(pet);
    store.activePetId = pet.id;
    save();
    return json(pet, 201);
  }

  if (path === '/pets/active' && method === 'PUT') {
    const input = (body ?? {}) as { petId?: string | null };
    store.activePetId = input.petId ?? null;
    save();
    return json({ items: store.pets, activePetId: store.activePetId });
  }

  if (path === '/parks' && method === 'POST') {
    const input = (body ?? {}) as { name?: string; capacity?: number; isPrivate?: boolean };
    return json(
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: input.name ?? 'A park',
        hostId: 'user-preview',
        hostUsername: 'you',
        capacity: input.capacity ?? 6,
        isPrivate: Boolean(input.isPrivate),
        occupancy: 0,
        createdAt: new Date().toISOString(),
      },
      201,
    );
  }

  if (path === '/pets/active' && method === 'GET') {
    return json(store.pets.find((p) => p.id === store.activePetId) ?? null);
  }

  // --- environment --------------------------------------------------------
  if (path === '/environments/current' && method === 'GET') {
    return json({
      id: 'env-preview',
      ownerId: 'user-preview',
      name: 'Preview Room',
      sceneData: store.sceneData,
      objectCount: store.objects.length,
      updatedAt: new Date().toISOString(),
    });
  }
  if (path.endsWith('/style') && method === 'PUT') {
    store.sceneData = (b as { sceneData: Record<string, unknown> }).sceneData;
    save();
    return json({ id: 'env-preview', sceneData: store.sceneData, objectCount: 0, name: 'Preview Room', ownerId: 'user-preview', updatedAt: new Date().toISOString() });
  }
  if (path.endsWith('/objects') && method === 'GET') return json(store.objects);
  if (path.endsWith('/objects') && method === 'PUT') {
    store.objects = (b as { objects: Record<string, unknown>[] }).objects;
    save();
    return json(store.objects);
  }

  // --- goals --------------------------------------------------------------
  if (path === '/goals' && method === 'GET') {
    return json({
      items: store.goals,
      openCount: store.goals.filter((g) => g.status === 'open').length,
      maxOpen: MAX_OPEN,
    });
  }
  if (path === '/goals' && method === 'POST') {
    const open = store.goals.filter((g) => g.status === 'open').length;
    if (open >= MAX_OPEN) {
      return fail(
        409,
        'GOAL_LIMIT_REACHED',
        'You already have six things to work toward. Finish one before adding another — one step at a time beats another mountain.',
      );
    }
    const goal = {
      id: uuid(),
      title: (b as { title: string }).title,
      description: '',
      status: 'open',
      createdAt: new Date().toISOString(),
      completedAt: null,
      memory: null,
    };
    store.goals = [goal, ...store.goals];
    save();
    return json(goal, 201);
  }
  const complete = /^\/goals\/([^/]+)\/complete$/.exec(path);
  if (complete && method === 'POST') {
    const goal = store.goals.find((g) => g.id === complete[1]);
    if (!goal) return fail(404, 'NOT_FOUND', 'Goal not found');
    if (goal.status === 'completed') return json(goal);

    const memory = (b as { memory?: { title?: string; description?: string; imageUrl?: string } }).memory;
    if (memory?.imageUrl && !STORED_PATH.test(memory.imageUrl)) {
      return fail(422, 'VALIDATION_FAILED', 'memory.imageUrl must be a path returned by the media endpoints.');
    }

    goal.status = 'completed';
    goal.completedAt = new Date().toISOString();

    if (memory) {
      const record = {
        id: uuid(),
        goalId: goal.id,
        type: 'goal_completed',
        title: memory.title ?? (goal.title as string),
        description: memory.description ?? '',
        imageUrl: memory.imageUrl ?? null,
        createdAt: new Date().toISOString(),
      };
      store.memories = [record, ...store.memories];
      goal.memory = record;
    }

    // The real server moves affection inside the completion's transaction and
    // reports what the move was worth (`GoalsService.complete`). The stub does
    // the same arithmetic so the celebration's "+N Happiness" is exercised here
    // rather than only in production.
    const before = store.affection ?? 0.5;
    const after = Math.min(1, before + 0.09 * (0.35 + 0.65 * (1 - before)));
    store.affection = after;

    save();
    return json({
      ...goal,
      affection: affectionView(),
      affectionGained: Math.max(0, Math.round((after - before) * 100)),
    });
  }
  const reopen = /^\/goals\/([^/]+)\/reopen$/.exec(path);
  if (reopen && method === 'POST') {
    const goal = store.goals.find((g) => g.id === reopen[1]);
    if (!goal) return fail(404, 'NOT_FOUND', 'Goal not found');
    goal.status = 'open';
    goal.completedAt = null;
    goal.memory = null;
    save();
    return json(goal);
  }
  const one = /^\/goals\/([^/]+)$/.exec(path);
  if (one && method === 'DELETE') {
    store.goals = store.goals.filter((g) => g.id !== one[1]);
    save();
    return json(null, 204);
  }

  // --- focus --------------------------------------------------------------
  // The same three rules the real service keeps, so a failure here is a client
  // bug rather than a disagreement about what the server would have said: the
  // clock is startedAt + duration, there is one slot, and a session whose time
  // ran out resolves as completed rather than being resumed.
  if (path === '/focus' && method === 'GET') {
    let justFinished: Record<string, unknown> | null = null;
    const running = store.sessions.find((row) => row.status === 'active');

    if (running && Date.now() >= deadline(running)) {
      running.status = 'completed';
      running.endedAt = deadline(running);
      store.affection = Math.min(1, store.affection + 0.04);
      save();
      justFinished = sessionView(running);
    }

    return json({
      active: focusView(),
      justFinished,
      affection: affectionView(),
      presets: [25, 45, 60, 90],
      minMinutes: 10,
      maxMinutes: 240,
    });
  }

  if (path === '/focus/sessions' && method === 'POST') {
    const { goalId, durationMinutes } = b as { goalId: string; durationMinutes: number };

    if (durationMinutes < 10) {
      return fail(422, 'VALIDATION_FAILED', 'Give it at least 10 minutes.');
    }

    const running = store.sessions.find((row) => row.status === 'active');
    if (running && Date.now() < deadline(running)) {
      // A double-clicked confirm is the same request, not a second session.
      if (running.goalId === goalId) {
        return json({ session: sessionView(running), affection: affectionView() });
      }
      return fail(409, 'FOCUS_IN_PROGRESS', 'Something is already being worked on.');
    }

    const session: FocusRow = {
      id: uuid(),
      goalId,
      durationMinutes,
      status: 'active',
      startedAt: Date.now(),
      endedAt: null,
    };

    store.sessions = [session, ...store.sessions];
    store.affection = Math.min(1, store.affection + 0.008);
    save();
    return json({ session: sessionView(session), affection: affectionView() });
  }

  const seal = /^\/focus\/sessions\/([^/]+)\/(complete|abort)$/.exec(path);
  if (seal && method === 'POST') {
    const session = store.sessions.find((row) => row.id === seal[1]);
    if (!session) return fail(404, 'NOT_FOUND', 'Session not found');

    if (session.status === 'active') {
      if (seal[2] === 'complete') {
        const remaining = deadline(session) - Date.now();
        if (remaining > 0) {
          return fail(
            409,
            'FOCUS_NOT_FINISHED',
            `${Math.ceil(remaining / 1000)} seconds still to go.`,
          );
        }
        session.status = 'completed';
        session.endedAt = deadline(session);
        store.affection = Math.min(1, store.affection + 0.04);
      } else {
        session.status = 'aborted';
        session.endedAt = Date.now();
        store.affection = Math.max(0, store.affection - 0.03);
      }
      save();
    }

    return json({ session: sessionView(session), affection: affectionView() });
  }

  // --- memories -----------------------------------------------------------
  if (path === '/memories' && method === 'GET') return json(store.memories);
  const memory = /^\/memories\/([^/]+)$/.exec(path);
  if (memory && method === 'DELETE') {
    store.memories = store.memories.filter((m) => m.id !== memory[1]);
    save();
    return json(null, 204);
  }

  /*
   * --- the social layer, enough of it to look at ---------------------------
   *
   * Not a simulation of other people: there is no socket here, so presence,
   * parks and live delivery are all absent and the panel says so honestly
   * ("Lost the thread"). What this covers is the part that is *layout* — a
   * friend list, a conversation with a scrollback and a composer — which is
   * the half that has to survive a phone keyboard and cannot be checked
   * anywhere else without two real accounts and a WebSocket.
   */
  if (path === '/friends' && method === 'GET') {
    return json({ friends: STUB_FRIENDS, incoming: [], outgoing: [] });
  }

  if (path === '/chat/conversations' && method === 'GET') {
    return json(
      STUB_FRIENDS.map((friend, index) => ({
        id: `conversation-${index}`,
        userId: friend.userId,
        username: friend.username,
        pet: friend.pet,
        lastMessageAt: new Date(Date.now() - index * 60_000).toISOString(),
        preview: index === 0 ? 'See you by the bench' : null,
      })),
    );
  }

  const thread = /^\/chat\/conversations\/([^/]+)\/messages$/.exec(path);
  if (thread && method === 'GET') return json(stubMessages(thread[1]));

  if (thread && method === 'POST') {
    const sent = {
      id: `dm-${Date.now()}`,
      conversationId: 'conversation-0',
      senderId: 'user-preview',
      withUserId: thread[1],
      body: String((body as { body?: string })?.body ?? ''),
      createdAt: new Date().toISOString(),
    };
    store.sent.push(sent);
    save();
    return json(sent, 201);
  }

  if (path === '/parks' && method === 'GET') return json([]);

  return fail(404, 'NOT_FOUND', `No stub for ${method} ${path}`);
}

/** Two people to talk to, so the list and a thread both have something in them. */
const STUB_FRIENDS = [
  {
    userId: 'friend-marlow',
    username: 'marlow',
    pet: { id: 'pet-marlow', name: 'Tuft', species: 'blob', appearanceData: { seed: 7, bodyType: 'pear' } },
    since: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    userId: 'friend-quill',
    username: 'quill',
    pet: { id: 'pet-quill', name: 'Nib', species: 'blob', appearanceData: { seed: 21, earType: 'floppy' } },
    since: new Date(Date.now() - 172_800_000).toISOString(),
  },
];

/**
 * A conversation long enough to scroll.
 *
 * Length is the point: a thread of two lines proves nothing about a log that
 * has to stay pinned to its newest message while a keyboard takes half the
 * screen. Twenty-four is more than fits any phone.
 */
function stubMessages(withUserId: string): Record<string, unknown>[] {
  const lines = [
    'are you about later',
    'yes — the long grass?',
    'Tuft has been asleep on the rug all morning',
    'mine keeps knocking the ball behind the shelf',
    'that is a whole personality',
    'i have given up moving it',
  ];

  const history = Array.from({ length: 24 }, (_, index) => ({
    id: `dm-stub-${index}`,
    conversationId: 'conversation-0',
    senderId: index % 2 === 0 ? withUserId : 'user-preview',
    withUserId,
    body: lines[index % lines.length],
    createdAt: new Date(Date.now() - (24 - index) * 60_000).toISOString(),
  }));

  return [...history, ...store.sent.filter((m) => m.withUserId === withUserId)];
}

const realFetch = window.fetch.bind(window);

/** Set by a test to make the next upload fail, for the error path. */
let uploadShouldFail = false;

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  const upload = url.includes('/api/v1/media/uploads');
  if (upload) {
    calls.push({ method: 'POST', path: '/media/uploads' });
    if (uploadShouldFail) {
      return fail(413, 'PAYLOAD_TOO_LARGE', 'Pictures have to be under 5 MB.');
    }
    const id = Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    return json({
      fileId: id,
      url: `/uploads/memory/2026/08/${id}.png`,
      mimeType: 'image/png',
      sizeBytes: 1024,
      createdAt: new Date().toISOString(),
    }, 201);
  }

  const match = /\/api\/v1(\/.*)$/.exec(url);
  if (!match) return realFetch(input as RequestInfo, init);

  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  // A tick of latency, so loading states are real rather than theoretical.
  await new Promise((resolve) => setTimeout(resolve, 15));
  return handle(method, match[1], body);
}) as typeof window.fetch;

/* -------------------------------------------------------------------------- */

const dev = window as unknown as Record<string, unknown>;
dev.__calls = calls;
dev.__store = () => store;
dev.__reset = () => {
  store = {
    goals: [],
    memories: [],
    objects: [],
    sceneData: {},
    pets: [],
    activePetId: null,
    sessions: [],
    affection: 0.5,
    sent: [],
  };
  save();
};
/**
 * Move the running session's start back, so the countdown can be watched
 * reaching zero without sitting through twenty-five minutes of it.
 *
 * The clock is `startedAt + duration` on the server, so winding *that* back is
 * the honest way to simulate time passing — as opposed to poking the client's
 * countdown, which would test nothing at all.
 */
dev.__warp = (seconds: number) => {
  const active = store.sessions.find((row) => row.status === 'active');
  if (active) active.startedAt -= seconds * 1000;
  save();
};
dev.__affection = (value: number) => {
  store.affection = value;
  save();
};
dev.__failNextUpload = (value: boolean) => {
  uploadShouldFail = value;
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {/*
      A fixed id: this harness stubs the network entirely and there is no
      session behind it. The dashboard only uses the value to tell its own rows
      apart from other people's in the social panel, which this harness does not
      exercise.
    */}
    <Dashboard userId="00000000-0000-4000-8000-000000000000" />
  </StrictMode>,
);
