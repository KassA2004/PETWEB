import { lazy, Suspense, useCallback, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Link } from '../../components/ui/link';
import { cn } from '../../lib/utils';
import { HomeArtProvider } from './artLoader';
import { HOME_CREATURES } from './creatures';
import type { HomeCreature } from './creatures';
import { useReveal } from './reveal';
import { Sections } from './sections';

/**
 * The front door.
 *
 * One idea, told once: **your real progress becomes a small world you can watch
 * grow.** Everything on this page is in service of that sentence, and the page
 * is built as a walk through it rather than as a stack of feature cards —
 * a goal, a session, a creature, a memory, a room.
 *
 * Three rules shaped the implementation, and all three come from the product it
 * is a door to.
 *
 * **Every picture is the real renderer's output.** theme-and-design.md §20.1:
 * a thing is shown as the thing it makes, never as an illustration of it. So
 * this page ships no image files. The creature in the hero is a live
 * `PetRenderer`; the room lower down is `farmhouse.createScenery`; the
 * furniture is `renderObject`. What a visitor sees is exactly what they get,
 * and it cannot drift, because there is no second copy to drift from.
 *
 * **The renderer is not on the load path.** It is also two thirds of the
 * bundle, and `AuthGate` already keeps it away from anybody who has not signed
 * in. So the page paints — headline, copy, working buttons — and *then* fetches
 * the pictures when the browser is idle (`artLoader.tsx`). Every one of them
 * holds its final box in the meantime, so nothing a visitor is reading moves.
 *
 * **One tree, two shapes.** §20.5. The phone layout is not a second `return`;
 * it is the same elements with different classes. On a phone the hero is the
 * copy then the creature, the CTA is the full width of the screen, and the
 * reveal distances are shorter, because a 2 rem rise on a 375-pixel screen is
 * a much bigger gesture than the same rise on a desktop.
 *
 * Motion is `features/home/reveal.ts`: one `IntersectionObserver` for the whole
 * page, `opacity` and `transform` only, and nothing at all under
 * `prefers-reduced-motion`.
 */

/**
 * The live creature, behind its own boundary.
 *
 * Separate from `artLoader`'s pictures because it is a component rather than a
 * URL, and because it is the one thing on the page that keeps a WebGL context
 * and a frame loop. Below the boundary is where PixiJS lands.
 */
const CreatureStage = lazy(() =>
  import('./CreatureStage').then((m) => ({ default: m.CreatureStage })),
);

export function Home() {
  return (
    <HomeArtProvider>
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <SiteHeader />
        <main id="main" className="flex-1">
          <Hero />
          <Sections />
        </main>
        <SiteFooter />
      </div>
    </HomeArtProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Chrome                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The header.
 *
 * Sticky, and deliberately **not** frosted. A `backdrop-filter` on an element
 * that sits over a scrolling page is a full-screen filter pass every frame, and
 * a phone is exactly where that shows up. The same effect the blur was reaching
 * for — "the page continues underneath" — is bought here with an opaque paper
 * colour and a hairline rule, for nothing.
 */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95">
      <a
        href="#main"
        className={cn(
          'sr-only rounded-lg bg-card px-4 py-2 text-sm font-medium shadow-lg',
          'focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        Skip to content
      </a>

      <div
        className={cn(
          'mx-auto flex w-full max-w-6xl items-center justify-between gap-3',
          'px-5 py-3 sm:px-8',
          'pt-[max(0.75rem,env(safe-area-inset-top))]',
        )}
      >
        {/* Padded rather than bare: a 20-pixel-tall link is a link a thumb
            misses. The negative margin keeps it optically flush with the edge. */}
        <Link
          to="home"
          className="-mx-2 rounded-lg px-2 py-2 text-sm font-semibold tracking-tight hover:bg-muted sm:text-base"
        >
          Pocus
        </Link>

        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm" silent>
            <Link to="login">Log In</Link>
          </Button>
          <Button asChild size="sm" silent>
            <Link to="join">Start</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

/**
 * The footer.
 *
 * A closing line and the two doors, and nothing else. A footer's job on a page
 * with one idea is to end it rather than to offer a second navigation of it —
 * a column of links to sections the visitor has just scrolled through is the
 * page admitting it was not worth reading in order.
 *
 * The name is repeated here on purpose. It is the last thing on the page, and
 * the one word a visitor has to leave with.
 */
function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div
        className={cn(
          'mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8',
          'sm:flex-row sm:items-end sm:justify-between',
          'pb-[max(2.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div>
          <p className="text-base font-semibold tracking-tight">Pocus</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            A small creature lives here. Be nice to it.
          </p>
        </div>

        <nav
          aria-label="Get started"
          className="flex items-center gap-4 text-sm text-muted-foreground"
        >
          <Link to="login" className="rounded px-1 py-0.5 hover:text-foreground">
            Log in
          </Link>
          <Link to="join" className="rounded px-1 py-0.5 hover:text-foreground">
            Start your world
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The first screen.
 *
 * On a phone: the sentence, the button, then the creature — because the
 * creature is the reward for the sentence, and a visitor who has to scroll past
 * a picture to find out what the product is has been given the punchline first.
 * On a wide screen the two sit side by side, which is the same order read left
 * to right.
 */
function Hero() {
  const [creature, setCreature] = useState<HomeCreature>('blorb');
  const reveal = useReveal<HTMLDivElement>();
  const revealArt = useReveal<HTMLDivElement>();

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pt-8 pb-12 sm:px-8 sm:pt-16 sm:pb-20 lg:pt-24 lg:pb-28">
      <div className="grid items-center gap-7 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
        <div ref={reveal} className="reveal-lead">
          <h1 className="display text-[2.25rem] font-bold sm:text-5xl lg:text-[3.5rem]">
            Your progress lives somewhere.
          </h1>

          <p className="prose-lead mt-4 max-w-prose text-base text-muted-foreground sm:mt-5 sm:text-lg">
            Set one small goal. Focus on it. Finish it. A creature in a warm little
            room notices every time — and the room grows because you did.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <Button asChild size="lg" silent className="h-12 w-full sm:w-auto sm:px-8">
              <Link to="join">Start Your World</Link>
            </Button>
            {/* Bordered, not bare. A full-width ghost button on a phone has no
                edge and no background, so it reads as a heading rather than as
                something you can press. */}
            <Button
              asChild
              size="lg"
              variant="ghost"
              silent
              className="h-12 w-full border border-border sm:w-auto sm:border-transparent"
            >
              <Link to="login">I Already Have One</Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground sm:mt-5">
            Free to start. No card, no team, no dashboard.
          </p>
        </div>

        <div ref={revealArt} className="reveal-lead reveal-step-1">
          <CreaturePlinth selected={creature} onSelect={setCreature} />
        </div>
      </div>
    </section>
  );
}

/**
 * How big the creature's canvas is, given the room it has.
 *
 * Chosen once, from the space the plinth actually got, and then left alone. Two
 * reasons, and the second is the important one:
 *
 * ```text
 *   a canvas that follows its container reallocates a WebGL back buffer on
 *   every pixel of a resize, which is the most expensive thing a window drag
 *   can do to a page
 *
 *   a *second* mount at another size is worse: both mount, both claim the one
 *   shared stage (`petStage.ts`), and the loser is the one that is visible —
 *   which is exactly the bug a `sm:hidden` / `hidden sm:block` pair produced.
 *   `hidden` is display, not unmounting
 * ```
 *
 * So there is one stage, and the size is a number rather than a breakpoint.
 */
function stageSize(available: number): number {
  /*
   * Smaller when the plinth has the whole column to itself, which is what a
   * phone looks like from here — 350 points of a 390-point screen. At 288 the
   * creature pushed the chips under it off the bottom of an iPhone; at 232 the
   * whole hero, poke hint and all, lands inside one screen.
   *
   * The desktop column is a fixed 26 rem, so the threshold separates the two
   * cases without anybody having to ask the window how wide it is.
   */
  const cap = available >= 400 ? 288 : 232;
  return Math.round(Math.max(184, Math.min(cap, available - 16)));
}

/**
 * The creature, on a warm circle of light, with a way to try another one.
 */
function CreaturePlinth({
  selected,
  onSelect,
}: {
  selected: HomeCreature;
  onSelect: (creature: HomeCreature) => void;
}) {
  const [size, setSize] = useState<number | null>(null);

  /*
   * One measurement, at mount, in a callback ref — so it happens after layout
   * and before paint, and never again. A `ResizeObserver` here would be a
   * canvas reallocation per frame of a window drag for no visible gain: the
   * creature is a fixed-size portrait, not a responsive illustration.
   */
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setSize(stageSize(node.getBoundingClientRect().width));
  }, []);

  return (
    <div ref={measure} className="flex flex-col items-center gap-4 sm:gap-5">
      <div
        className="relative grid place-items-center"
        style={{ width: size ?? 224, height: size ?? 224 }}
      >
        {/* The light it sits in. One slow, tiny pulse — the only continuously
            moving thing on the page that is not the creature. */}
        <span
          aria-hidden
          className="petweb-breathe absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(245,223,160,0.55) 0%, rgba(239,95,140,0.16) 45%, transparent 70%)',
          }}
        />

        {size !== null && (
          <Suspense
            fallback={
              <div
                aria-hidden
                className="petweb-skeleton absolute inset-6 rounded-full bg-card/60"
              />
            }
          >
            <CreatureStage creature={selected} size={size} className="relative" />
          </Suspense>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="hidden sm:inline">Move your pointer — it is watching. </span>
          Give it a poke.
        </p>

        <div
          role="radiogroup"
          aria-label="Try a different creature"
          className="flex flex-wrap items-center justify-center gap-1.5"
        >
          {HOME_CREATURES.map((option) => {
            const active = option.key === selected;

            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(option.key)}
                className={cn(
                  'press rounded-full border px-3.5 py-1.5 text-xs font-medium outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
