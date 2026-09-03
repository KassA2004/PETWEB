import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { Button } from '../../components/ui/button';
import { Link } from '../../components/ui/link';
import { cn } from '../../lib/utils';
import { CreaturePicture, ObjectPicture, RoomObject, RoomPicture } from './artLoader';
import { HOME_CREATURES } from './creatures';
import { useInView, usePrefersReducedMotion, useReveal } from './reveal';

/**
 * The middle of the page: five things the product does, in the order somebody
 * would actually do them.
 *
 * ```text
 *   a small goal  →  focus on it  →  the creature notices  →  you keep it
 *                                              ↓
 *                                    and the room fills up
 * ```
 *
 * Each section demonstrates rather than describes, and each demonstration is
 * the product's own mechanism: the goal really strikes through with
 * `animate-strike`, the completion really rings with `animate-ring`, the room
 * really is `farmhouse.createScenery` and the furniture really is
 * `renderObject`. Nothing here is a mockup of the product; it is small pieces
 * of it.
 *
 * The demonstrations are interactive on purpose. A visitor who presses the
 * button has *done* the thing, which is worth more than a paragraph and is why
 * none of these sections has one.
 */

/* -------------------------------------------------------------------------- */
/* The frame every section shares                                             */
/* -------------------------------------------------------------------------- */

function Section({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const reveal = useReveal<HTMLDivElement>();

  return (
    <section className={cn('border-t border-border/60 py-16 sm:py-24', className)}>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div ref={reveal}>
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
            {eyebrow}
          </p>
          <h2 className="display mt-3 max-w-2xl text-[1.75rem] font-bold sm:text-[2.5rem]">
            {title}
          </h2>
        </div>

        {children}
      </div>
    </section>
  );
}

/** Body copy at the one size it is set at on this page. */
function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'prose-lead max-w-prose text-base text-muted-foreground sm:text-lg',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Sections() {
  return (
    <>
      <SmallGoals />
      <Focus />
      <YourPet />
      <Memories />
      <YourWorld />
      <Close />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* One small thing                                                            */
/* -------------------------------------------------------------------------- */

const DEMO_GOALS = [
  { id: 'a', title: 'Write 300 words' },
  { id: 'b', title: 'Ten minutes of Spanish' },
];

/**
 * A goal, finished.
 *
 * The interaction the whole product is built on, in one card: press the circle
 * and the line strikes through, a ring goes out from it, and the counter drops.
 * All three are the classes the real panel uses (`index.css`), so this is the
 * product's own feedback rather than an impression of it.
 */
function SmallGoals() {
  const reveal = useReveal<HTMLDivElement>();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const openCount = DEMO_GOALS.length - Object.values(done).filter(Boolean).length;

  return (
    <Section eyebrow="Small goals" title="One thing. Not everything.">
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div ref={reveal} className="reveal-step-1 order-2 lg:order-1">
          <Lead>
            You do not have to conquer the day. Write down one small thing you will
            actually do, and let that be enough for now.
          </Lead>
          <Lead className="mt-4">
            Six open at a time, on purpose. A list you can finish is a list you will
            keep looking at.
          </Lead>
        </div>

        <div className="order-1 lg:order-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/10 sm:p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                To Do
              </h3>
              <p
                aria-live="polite"
                className="text-xs text-muted-foreground tabular-nums"
              >
                {openCount} of 6 open
              </p>
            </div>

            <ul className="mt-3 space-y-2">
              {DEMO_GOALS.map((goal) => {
                const finished = Boolean(done[goal.id]);

                return (
                  <li
                    key={goal.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3"
                  >
                    <span className="relative grid shrink-0 place-items-center">
                      {finished && (
                        <span
                          aria-hidden
                          className="animate-ring absolute size-5 rounded-full bg-primary"
                        />
                      )}
                      {/* The circle is 20px to look at and 36px to hit — the
                          same treatment the real goal list gets. */}
                      <button
                        type="button"
                        aria-pressed={finished}
                        aria-label={
                          finished ? `Reopen ${goal.title}` : `Complete ${goal.title}`
                        }
                        onClick={() =>
                          setDone((current) => ({ ...current, [goal.id]: !current[goal.id] }))
                        }
                        className="group/check relative -m-2 grid size-9 place-items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'press size-5 rounded-full border-2',
                            finished
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/40 group-hover/check:border-primary group-hover/check:bg-primary/20',
                          )}
                        />
                      </button>
                    </span>

                    <span className="relative min-w-0 flex-1 text-sm">
                      <span className={cn('truncate', finished && 'text-muted-foreground')}>
                        {goal.title}
                      </span>
                      {finished && (
                        <span
                          aria-hidden
                          className="animate-strike absolute top-1/2 left-0 h-px w-full bg-muted-foreground"
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-muted-foreground">
              {openCount === 0
                ? 'Nothing on the list. Your creature is delighted and slightly suspicious.'
                : 'Go on — tick one.'}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Focus                                                                      */
/* -------------------------------------------------------------------------- */

const RING_RADIUS = 46;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * What a session looks like from outside it.
 *
 * The room dims, the tools go, and a ring closes. The ring is the one thing on
 * this page that animates for longer than a second, so it is `stroke-dashoffset`
 * on a single SVG circle — one element, no layout, and the same technique the
 * real loading ring uses (`WorldLoader.tsx`). It starts when the section is on
 * screen and not before, so a visitor never scrolls down to find it already
 * finished.
 */
function Focus() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const reveal = useReveal<HTMLDivElement>();

  return (
    <Section eyebrow="Focus" title="Then the room goes quiet.">
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div ref={reveal} className="reveal-step-1">
          <Lead>
            Drag the one thing you have chosen into the slot and start. The tabs step
            back, the light drops, and for a while there is nothing on the screen but
            the work and something small keeping you company.
          </Lead>
          <Lead className="mt-4">
            When the time is up the room comes back, a little brighter than it was.
          </Lead>
        </div>

        <div ref={ref} className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10">
          <RoomPicture width={640} className="w-full" />

          {/* The session, over the room. Opacity only — the picture underneath
              is never repainted, it is just seen through something. */}
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 bg-[#241636] transition-opacity duration-[1200ms] ease-out',
              'motion-reduce:transition-none',
              seen ? 'opacity-55' : 'opacity-0',
            )}
          />

          <div className="absolute inset-0 grid place-items-center">
            <svg viewBox="0 0 110 110" className="size-24 sm:size-28" aria-hidden>
              <circle
                cx="55"
                cy="55"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,247,236,0.25)"
                strokeWidth="5"
              />
              <circle
                cx="55"
                cy="55"
                r={RING_RADIUS}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={seen && !reduced ? 0 : RING_LENGTH}
                transform="rotate(-90 55 55)"
                style={{
                  transition: reduced
                    ? 'none'
                    : 'stroke-dashoffset 9s cubic-bezier(0.35, 0, 0.2, 1)',
                }}
              />
            </svg>

            <p
              className={cn(
                'absolute mt-28 text-sm font-medium text-[#fff7ec] transition-opacity duration-700 sm:mt-32',
                seen ? 'opacity-100' : 'opacity-0',
              )}
            >
              Focusing…
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Your pet                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The creature, and what it is for.
 *
 * The temptation here is a number — a streak, a level, a score. The section
 * exists to say the opposite: it is a creature with a mood, not a metric, and
 * the only thing it does with your work is notice it.
 */
function YourPet() {
  const reveal = useReveal<HTMLDivElement>();
  const chain = useReveal<HTMLDivElement>();

  return (
    <Section eyebrow="Your creature" title="Somebody is keeping you company.">
      <div ref={reveal} className="reveal-step-1 mt-8">
        <Lead>
          Not a score, and not a streak you can break. A creature with a mood, that
          potters about while you work, comes over when you are done, and is quietly
          pleased with you. Look after it by looking after yourself.
        </Lead>
      </div>

      <div
        ref={chain}
        className="reveal-step-2 mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6"
      >
        {HOME_CREATURES.map((witness) => (
          <figure
            key={witness.key}
            className={cn(
              'flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5',
              'shadow-lg shadow-black/5',
            )}
          >
            <CreaturePicture
              creature={witness.key}
              size={180}
              alt={`${witness.label}, one of the creatures you can build`}
              className="w-32 sm:w-36"
            />
            <figcaption className="text-center">
              <span className="block text-sm font-semibold">{witness.label}</span>
              <span className="block text-xs text-muted-foreground">{witness.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Memories                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What is left afterwards.
 *
 * A finished goal is a small page rather than a row that goes grey: what you
 * did, when, and what it felt like. The date is `Intl.DateTimeFormat` on the
 * visitor's own locale — a hard-coded American date on a European screen is the
 * smallest possible way to say "this was not made for you".
 */
function Memories() {
  const reveal = useReveal<HTMLDivElement>();
  const card = useReveal<HTMLDivElement>();
  const [kept, setKept] = useState(false);

  const today = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <Section eyebrow="Memories" title="The part you keep.">
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div ref={reveal} className="reveal-step-1">
          <Lead>
            Finishing something can leave a memory behind — a line about what you did,
            a picture if you took one, and the creature that was there.
          </Lead>
          <Lead className="mt-4">
            Months later it reads like a diary you did not have to remember to write.
          </Lead>

          <Button
            type="button"
            variant="secondary"
            className="mt-6"
            onClick={() => setKept((current) => !current)}
            aria-pressed={kept}
          >
            {kept ? 'Put It Back' : 'Keep This One'}
          </Button>
        </div>

        <div ref={card} className="reveal-step-2">
          <article
            className={cn(
              'relative rounded-2xl border p-5 transition-colors duration-300 sm:p-6',
              kept
                ? 'border-primary/40 bg-card shadow-xl shadow-primary/10'
                : 'border-border bg-card/70 shadow-lg shadow-black/5',
            )}
          >
            {kept && (
              <span
                aria-hidden
                className="animate-ring absolute top-6 right-6 size-6 rounded-full bg-primary"
              />
            )}

            <div className="flex items-start gap-4">
              <CreaturePicture
                creature="blorb"
                size={140}
                alt=""
                className="w-16 shrink-0 sm:w-20"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  {today}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-balance">
                  Wrote 300 words
                </h3>
                <p className="prose-lead mt-2 text-sm text-muted-foreground">
                  Twenty-five minutes, one cup of tea. Harder to start than to finish,
                  which is usually how it goes.
                </p>
              </div>
            </div>

            <p
              className={cn(
                'mt-4 text-xs transition-colors duration-300',
                kept ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {kept ? 'Kept — it is in the book now.' : 'Not kept yet.'}
            </p>
          </article>
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Your world                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Where each thing stands — on the floor of the room, not on the picture of it.
 *
 * Two numbers per object, in the room's own coordinates (`world/Projection.ts`:
 * x runs 0…1280 wall to wall, z runs 0…600 back to front), and the camera works
 * out the rest. `RoomObject` asks the art module for the screen geometry, which
 * is where the projection and the artwork's own proportions live.
 *
 * It used to be four hand-tuned screen percentages each, and they did not
 * survive being read back through the camera: the back row resolved to floor
 * points *outside the room* — the plant at world x = −353, a third of a room
 * inside the left wall — so the plant and the lamp were drawn standing on the
 * side walls and the near row was drawn half again too large. Positions the
 * room itself would produce cannot be wrong in that way.
 *
 * These are the same places the room furnishes itself with on day one
 * (`world/environments`), which is the point of the section: this is what your
 * room will look like.
 */
const ROOM_SLOTS: {
  type: ObjectType;
  label: string;
  x: number;
  z: number;
}[] = [
  { type: 'bookshelf', label: 'A bookshelf', x: 400, z: 60 },
  { type: 'lamp', label: 'A floor lamp', x: 1180, z: 60 },
  { type: 'plant', label: 'A potted plant', x: 100, z: 60 },
  { type: 'bed', label: 'A cloud bed', x: 880, z: 300 },
  { type: 'table', label: 'A low table', x: 280, z: 300 },
  { type: 'basket', label: 'A wicker basket', x: 100, z: 540 },
  { type: 'ball', label: 'A ball', x: 574, z: 544 },
  { type: 'plush', label: 'A plush toy', x: 820, z: 540 },
];

/** The pieces that are already there when the section arrives. */
const STANDING = 3;

/**
 * The room, filling up.
 *
 * The strongest thing this page can show, so it is the one section that is
 * mostly picture. Three pieces are already standing when it scrolls into view
 * and the rest are a catalogue the visitor can actually press — which is the
 * real Room panel's interaction (tap a thing and it lands in the room), at the
 * size of a demonstration.
 *
 * Each arrival is one element gaining `data-reveal="in"`: opacity and a small
 * scale, no layout, no re-render of the room behind it.
 */
function YourWorld() {
  const reveal = useReveal<HTMLDivElement>();
  const [placed, setPlaced] = useState<string[]>(() =>
    ROOM_SLOTS.slice(0, STANDING).map((slot) => slot.type),
  );

  const remaining = ROOM_SLOTS.filter((slot) => !placed.includes(slot.type));

  return (
    <Section eyebrow="Your world" title="And then the room fills up.">
      <div ref={reveal} className="reveal-step-1 mt-8">
        <Lead>
          Furniture, colour, the hour on the clock, what is outside the window. Put a
          lamp down and the light in the room actually changes, because it is the same
          lamp your creature walks around.
        </Lead>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10">
        <div className="relative">
          <RoomPicture width={960} className="w-full" />

          {ROOM_SLOTS.filter((slot) => placed.includes(slot.type)).map((slot) => (
            <RoomObject
              key={slot.type}
              type={slot.type}
              label={slot.label}
              x={slot.x}
              z={slot.z}
            />
          ))}
        </div>

        <div className="border-t border-border/60 p-4 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {remaining.length > 0 ? 'Put something in it' : 'That is the idea'}
          </p>

          {remaining.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {remaining.map((slot) => (
                <li key={slot.type}>
                  <button
                    type="button"
                    onClick={() => setPlaced((current) => [...current, slot.type])}
                    className={cn(
                      'press flex items-center gap-2 rounded-full border border-border bg-background/70 py-1.5 pr-3.5 pl-1.5',
                      'text-xs font-medium outline-none hover:border-primary/50',
                      'focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                  >
                    <ObjectPicture
                      type={slot.type}
                      label=""
                      size={96}
                      className="size-7 shrink-0"
                    />
                    {slot.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Yours will not look like this one.
              </p>
              {/*
                A border on the ghost button, because on a phone this wraps onto
                its own line and a borderless control alone on a line reads as a
                heading rather than as something to press. The same treatment the
                closing section's secondary action gets.
              */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="border border-border"
                onClick={() => setPlaced(ROOM_SLOTS.slice(0, STANDING).map((s) => s.type))}
              >
                Clear It Out
              </Button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* The way in                                                                 */
/* -------------------------------------------------------------------------- */

function Close() {
  const reveal = useReveal<HTMLDivElement>();

  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <div ref={reveal} className="mx-auto w-full max-w-3xl px-5 text-center sm:px-8">
        <h2 className="display text-[1.75rem] font-bold sm:text-[2.5rem]">
          Small goals. Real focus.
          <br />
          A world that grows with you.
        </h2>

        <Lead className="mx-auto mt-5">
          It takes about a minute to make a creature and put it somewhere warm.
        </Lead>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg" silent className="h-12 w-full sm:w-auto sm:px-8">
            <Link to="join">Start Your World</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            silent
            className="h-12 w-full border border-border sm:w-auto sm:border-transparent"
          >
            <Link to="login">Log In</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
