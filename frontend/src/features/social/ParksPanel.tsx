import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  DoorClosed,
  KeyRound,
  Loader2,
  Lock,
  PawPrint,
  Plus,
  RefreshCw,
  Trees,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet } from '../../components/ui/sheet';
import { Skeleton } from '../../components/ui/skeleton';
import { ApiError } from '../../lib/api';
import { useDelayedVisible } from '../../lib/useDelayedVisible';
import { cn } from '../../lib/utils';
import { createPark, fetchParks } from './api';
import type { Park } from './api';
import type { SocialStatus } from './socket';

/**
 * Finding a park, and opening one.
 *
 * A list and a form, and the interesting decisions in both belong to the
 * server:
 *
 * ```text
 *   occupancy    counted server-side and shown as it was counted. This panel
 *                does not decide whether a park is full — it presses Join and
 *                is told. Two people looking at "5 / 6" and both pressing is
 *                exactly the race the row lock in `ParksService.join` exists
 *                for, and a client that greyed the button out would only be
 *                hiding it
 *   private      a padlock and a passcode field. The credential is never
 *                anywhere near this file: it is typed, sent once over the
 *                socket, verified against a scrypt hash and forgotten
 *   the list      refreshed when the user asks and when they come back to this
 *                tab — not on a timer. A poll would be the thing the whole
 *                feature is built to avoid, for a list that changes when
 *                somebody opens a park and not otherwise
 * ```
 */

/**
 * Whether this account's creature is something other people can be shown.
 *
 * A creature only exists in the browser until it is saved: `usePetLibrary`
 * holds a *working copy* that the room renders and the editor writes to, and
 * pressing Save is what turns it into a `Pet` row. That is the right design for
 * an editor — silently overwriting a preset because somebody dragged a slider
 * is an autosave people learn to fear — and it has one consequence here.
 *
 * The park draws every creature from its owner's `Pet` row, on the *server*,
 * because a client must not be able to send a rig (its own or anybody else's).
 * So a creature that has never been saved is a creature the server cannot show
 * anyone: its owner would walk into a park invisible.
 *
 * Rather than let that happen quietly, the gate is up front and it is one
 * button. Nothing is auto-saved behind the user's back, and nobody joins a park
 * as a ghost.
 */
export interface CreatureGate {
  saved: boolean;
  name: string;
  busy: boolean;
  save: () => Promise<void>;
}

interface ParksPanelProps {
  /** Go and stand in one. The passcode is whatever was typed for a private park. */
  onEnter: (park: Park, passcode?: string) => void;
  creature: CreatureGate;
  /**
   * The socket, which is what a join travels over.
   *
   * Shown rather than acted on: a list of parks read over HTTP is perfectly
   * accurate while the WebSocket is down, and hiding it would leave somebody
   * pressing Join and being told "you are not connected" with no idea why.
   */
  status: SocialStatus;
  /** Why the last attempt to get into one did not work, if it did not. */
  refusal?: string | null;
  onDismissRefusal?: () => void;
  /**
   * Open the "new park" form as a screen rather than inline.
   *
   * True on a phone. Three fields, a slider and two paragraphs of explanation
   * do not fit a panel that a keyboard has cut to 300 points — the reported
   * symptom was not being able to move around in it — and a form you scroll to
   * find the button of is a form people abandon. As a screen it has room, and
   * the buttons sit at the bottom of the screen where a phone puts them.
   */
  fullScreen?: boolean;
}

export function ParksPanel({
  onEnter,
  creature,
  status,
  refusal,
  onDismissRefusal,
  fullScreen = false,
}: ParksPanelProps) {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);
  const [opening, setOpening] = useState(false);

  /** The park whose passcode is being typed, if any. */
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');

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
        const next = await fetchParks(controller.signal);
        if (controller.signal.aborted) return;
        setParks(next);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (!(cause instanceof ApiError && cause.isUnauthorized)) {
          setError('The parks could not be listed.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token]);

  const showSkeleton = useDelayedVisible(loading, { delay: 150, minVisible: 400 });

  const enter = (park: Park) => {
    if (!park.isPrivate) {
      onEnter(park);
      return;
    }

    // Private: ask, then enter. The field opens in the row itself rather than
    // in a dialog, because a modal for one short field is a modal the user has
    // to dismiss to find out they typed it wrong.
    if (unlocking === park.id) {
      onEnter(park, passcode);
      return;
    }

    setUnlocking(park.id);
    setPasscode('');
  };

  return (
    <div className="space-y-5">
      {refusal && (
        <p
          role="status"
          className="animate-rise flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <DoorClosed aria-hidden className="mt-px size-4 shrink-0" />
          <span className="flex-1">{refusal}</span>
          {onDismissRefusal && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismissRefusal}
              className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </p>
      )}

      {status === 'offline' && (
        <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WifiOff aria-hidden className="size-4 shrink-0" />
          Looking for the connection again. Parks will open once it is back.
        </p>
      )}

      {!creature.saved && (
        <section className="animate-rise space-y-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <PawPrint aria-hidden className="size-4 shrink-0 text-accent" />
            {creature.name} isn't written down yet
          </p>
          <p className="text-xs text-muted-foreground">
            A park draws everybody's creature from the one they've saved, so
            nobody else can see one that only exists in this browser. Keep{' '}
            {creature.name} and they can come along.
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={creature.busy}
            onClick={() => void creature.save()}
          >
            {creature.busy ? 'Keeping…' : `Keep ${creature.name}`}
          </Button>
        </section>
      )}

      <NewParkForm
        disabled={!creature.saved}
        busy={opening}
        fullScreen={fullScreen}
        onCreate={async (input) => {
          setOpening(true);
          try {
            const park = await createPark(input);
            if (!alive.current) return;
            // Straight in. Somebody who just opened a park meant to stand in
            // it, and making them find their own park in the list would be the
            // product asking a question it knows the answer to.
            onEnter(park, input.passcode);
          } catch (cause) {
            if (alive.current) {
              setError(
                cause instanceof ApiError
                  ? cause.message
                  : 'That park could not be opened.',
              );
            }
          } finally {
            if (alive.current) setOpening(false);
          }
        }}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Open now
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw aria-hidden className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {error && (
          <p className="animate-shake rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}

        {showSkeleton && (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((row) => (
              <Skeleton key={row} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!showSkeleton && !loading && parks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <Trees aria-hidden className="mx-auto size-7 text-muted-foreground/60" />
            <p className="mt-2 text-xs text-muted-foreground">
              Nobody's out. Open one above and somebody may wander in.
            </p>
          </div>
        )}

        <ul className="stagger space-y-2">
          {parks.map((park) => (
            <li
              key={park.id}
              className={cn(
                'space-y-2 rounded-xl border border-border bg-card p-3 transition-colors',
                unlocking === park.id && 'border-primary/50 bg-primary/5',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                >
                  <Trees className="size-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {park.isPrivate && (
                      <Lock
                        aria-label="Needs a passcode"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="truncate">{park.name}</span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <span className="truncate">{park.hostUsername}'s</span>
                    <Occupancy occupancy={park.occupancy} capacity={park.capacity} />
                  </p>
                </div>

                <Button
                  size="sm"
                  variant={park.isPrivate && unlocking !== park.id ? 'secondary' : 'default'}
                  className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                  disabled={!creature.saved}
                  onClick={() => enter(park)}
                >
                  {park.isPrivate && unlocking !== park.id ? (
                    <>
                      <KeyRound aria-hidden className="size-3.5" />
                      Passcode
                    </>
                  ) : (
                    <>
                      Join
                      <ArrowRight aria-hidden className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>

              {unlocking === park.id && (
                <form
                  className="animate-rise flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onEnter(park, passcode);
                  }}
                >
                  <Input
                    value={passcode}
                    onChange={(event) => setPasscode(event.target.value)}
                    placeholder="Passcode"
                    type="password"
                    name="park-passcode"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    enterKeyHint="go"
                    // Focused only where focusing is free. On a phone,
                    // `autoFocus` throws the keyboard up over the list the user
                    // was reading before they have said they want to type —
                    // which is the Web Interface Guidelines' rule and also the
                    // exact complaint about this screen.
                    autoFocus={!isTouch()}
                    aria-label={`Passcode for ${park.name}`}
                  />
                  <Button type="submit" size="sm" className="shrink-0" disabled={!passcode}>
                    Go in
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 px-2"
                    aria-label="Never mind"
                    onClick={() => setUnlocking(null)}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Whether focusing a field costs the user their view of the page.
 *
 * On a pointer device it does not, and putting the cursor in the one field a
 * form exists for is a courtesy. On a touch device it summons a keyboard over
 * half the screen before anybody has said they want to type — which the Web
 * Interface Guidelines rule out, and which was half of what made this form
 * unusable on a phone.
 */
function isTouch(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * How full a park is, as a shape rather than a fraction.
 *
 * Eight is the most a park ever holds (`park-limits.ts`), which is few enough
 * to draw one mark per creature — so "nearly full" is something the eye gets
 * before the number is read. The number is still there for anybody who wants
 * it, as the control's label.
 */
function Occupancy({ occupancy, capacity }: { occupancy: number; capacity: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={`${occupancy} of ${capacity} here`}
    >
      <Users aria-hidden className="size-3" />
      <span className="sr-only">{occupancy} of {capacity} here</span>
      <span aria-hidden className="flex items-center gap-[2px]">
        {Array.from({ length: capacity }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-1.5 rounded-full',
              index < occupancy ? 'bg-primary' : 'bg-muted-foreground/25',
            )}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Opening a park.
 *
 * Three decisions, and no more: what it is called, how many creatures it holds,
 * and whether anybody may walk in. A park is a temporary space that exists for
 * an afternoon — a settings screen for one would be longer than the park lasts.
 */
function NewParkForm({
  busy,
  disabled,
  fullScreen,
  onCreate,
}: {
  busy: boolean;
  /** No creature to bring. The gate above explains why. */
  disabled: boolean;
  /** Open as a screen rather than inline. See `ParksPanelProps.fullScreen`. */
  fullScreen: boolean;
  onCreate: (input: {
    name: string;
    capacity: number;
    isPrivate: boolean;
    passcode?: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(6);
  const [isPrivate, setPrivate] = useState(false);
  const [passcode, setPasscode] = useState('');
  /** What the form said when it was pressed too early. Cleared by typing. */
  const [complaint, setComplaint] = useState<string | null>(null);

  if (!open) {
    return (
      <Button className="w-full gap-2" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        Open a park
      </Button>
    );
  }

  /*
   * Why this cannot be submitted yet, or null.
   *
   * A *reason*, not a boolean, because the submit button is no longer disabled
   * for it. The Web Interface Guidelines are right about this and a phone makes
   * it obvious: a greyed-out button at the bottom of a screen whose reason is a
   * field you have scrolled past is a dead end with no explanation. Pressing it
   * now says what is missing instead.
   */
  const missing =
    name.trim().length === 0
      ? 'Give it a name first.'
      : isPrivate && passcode.trim().length < 4
        ? 'A passcode needs at least four characters.'
        : null;

  const body = (
    <form
      id="new-park"
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        fullScreen
          ? // The fields scroll and the buttons do not: on a phone the two
            // things you always need in reach are "do it" and "don't", and a
            // form whose commit button is somewhere below the fold is a form
            // people give up on rather than scroll.
            'gap-4 overflow-y-auto overscroll-contain p-4'
          : 'animate-rise gap-3 rounded-xl border border-border bg-card p-3',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;

        if (missing) {
          setComplaint(missing);
          return;
        }

        void onCreate({
          name: name.trim(),
          capacity,
          isPrivate,
          passcode: isPrivate ? passcode.trim() : undefined,
        });
      }}
    >
      {complaint && (
        <p
          role="alert"
          className="animate-shake rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          {complaint}
        </p>
      )}

      <div className="space-y-1">
        <label
          htmlFor="park-name"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          What to call it
        </label>
        <Input
          id="park-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setComplaint(null);
          }}
          placeholder="The long grass…"
          name="park-name"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          enterKeyHint="done"
          autoFocus={!isTouch()}
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="park-capacity"
          className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          <Users aria-hidden className="size-3.5" />
          Room for {capacity}
        </label>
        {/*
          A slider, not a number field. The range is two to eight and every
          value in it is fine — there is nothing to type and nothing to get
          wrong, which is what a slider is for.
        */}
        <input
          id="park-capacity"
          type="range"
          min={2}
          max={8}
          step={1}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <p className="text-[0.65rem] text-muted-foreground">
          Eight is the most. A lawn with more on it is a crowd, and a crowd is
          where two creatures meeting stops being visible.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setPrivate(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Lock aria-hidden className="size-3.5" />
            Needs a passcode
          </span>
          <span className="block text-xs text-muted-foreground">
            Still listed, so you can tell a friend its name — but nobody gets in
            without the word.
          </span>
        </span>
      </label>

      {isPrivate && (
        <Input
          value={passcode}
          onChange={(event) => {
            setPasscode(event.target.value);
            setComplaint(null);
          }}
          placeholder="A word your friends will know…"
          type="password"
          name="park-passcode"
          autoComplete="new-password"
          spellCheck={false}
          minLength={4}
          maxLength={64}
          enterKeyHint="done"
          aria-label="Passcode"
        />
      )}

      {!fullScreen && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Not now
          </Button>
          <Button type="submit" className="flex-1 gap-2" disabled={busy}>
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {busy ? 'Opening…' : 'Open it'}
          </Button>
        </div>
      )}
    </form>
  );

  if (!fullScreen) return body;

  return (
    <Sheet title="Open a park" backLabel="Not now" onBack={() => setOpen(false)}>
      {body}

      {/*
        Outside the scrolling form and attached to it by `form=`, which is what
        that attribute is for. A footer inside the scroller would be a footer
        you have to reach; one pinned here is one you can always press, and the
        keyboard inset keeps it above the keys rather than behind them.
      */}
      <div
        className="flex shrink-0 gap-2 border-t border-border p-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Not now
        </Button>
        <Button
          type="submit"
          form="new-park"
          className="flex-1 gap-2"
          disabled={busy}
        >
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {busy ? 'Opening…' : 'Open it'}
        </Button>
      </div>
    </Sheet>
  );
}
