/**
 * Other people's creatures, standing in the same room as yours.
 *
 * ```text
 *   socket  ──▶  VisitorPets.update()  ──▶  PetRenderer + PetAnimationController
 *   (10 Hz)      smoothing, lean,            (the same two classes the local
 *                depth, clips                 creature is drawn by)
 * ```
 *
 * ## Why these are not simulated
 *
 * A visitor is a *puppet*, and that is the correct architecture rather than a
 * shortcut. Their creature is being simulated — its brain is deciding what it
 * wants, its physics is resolving what it bumps into — on *their* machine, and
 * running a second simulation here would produce a second, different answer
 * that then has to be reconciled with the first one every tenth of a second.
 * The result of that reconciliation is the rubber-banding every naive
 * multiplayer game has.
 *
 * So the network says where a creature is and what it is doing, and this file's
 * whole job is to make four numbers arriving ten times a second look like a
 * living animal sixty times a second. Everything below is in service of that:
 *
 *   **smoothing**   the position is eased toward the last one heard rather than
 *                   snapped to it, so a creature crosses the room instead of
 *                   teleporting six times a second
 *   **the lean**    driven from the *smoothed* screen velocity, not from the
 *                   packet, so a creature still in motion still leans into
 *                   where it is going in the gaps between updates — the same
 *                   layer the resident creature leans with
 *   **the rig**     a real `PetRenderer` and a real `PetAnimationController`,
 *                   which is why a visitor breathes, blinks and swings its ears
 *                   at sixty frames per second on a ten-frame data rate
 *
 * ## Why they are in the stage layer
 *
 * Depth sorting has to include them, or a visitor's creature is drawn in front
 * of the bookshelf it is standing behind. They go into the same
 * `sortableChildren` container everything else in the room is in, with a
 * `zIndex` computed the same way (`BodyView.sortKeyOf`'s rule: the near edge of
 * the footprint), so a park with six creatures and a table in it sorts exactly
 * as a room with one creature and a table in it does.
 *
 * ## What is never taken from the network
 *
 * The appearance. It arrives from the *server*, which read it from that user's
 * own `Pet` row — a client cannot send a rig, its own or anybody else's. See
 * the gateway's class comment.
 */

import { Container, Graphics } from 'pixi.js';
import { PetAnimationController } from '../../animation/PetAnimationController';
import type { PetStateName } from '../../animation/PetAnimationController';
import { createSocialClip } from '../../animation/clips/Social';
import type { SocialClipKind, SocialRole } from '../../animation/clips/Social';
import { PetRenderer } from '../../assets/pets/PetRenderer';
import type { PetAppearanceInput } from '../../assets/pets/customization/PetAppearance';
import { createContactShadow } from '../../assets/environment/Shadows';
import { project, scaleAt, screenVelocityX } from '../../world/Projection';
import { depthTintOf } from './BodyView';

/**
 * How the local creature is drawn, and therefore how visitors must be.
 *
 * Imported as a number rather than from `PetRoom` because the dependency has to
 * point this way — the scene owns these, this file is one of its parts — and
 * because a visitor drawn at a different scale from the resident is the single
 * most obvious way to make a park look broken.
 */
const PET_SCALE = 0.8;

/**
 * How quickly a visitor catches up to where the network says it is.
 *
 * Per second, as an exponential approach. Tuned against the send rate rather
 * than by eye: at 10 Hz a packet arrives every 100 ms, and a creature that
 * closes ~90% of the gap in that time is visibly smooth without ever being far
 * enough behind to look like it is lagging.
 */
const CATCH_UP = 14;

/**
 * How far behind reality a visitor is allowed to be before it gives up and
 * jumps.
 *
 * A creature that has been picked up and thrown across the park, or one whose
 * owner's tab was asleep for a minute, must not spend eight seconds gliding
 * serenely to its new position. Past this, the smoothing is abandoned — a
 * teleport is honest about what happened, where a very long glide is a lie.
 */
const TELEPORT_DISTANCE = 420;

/** The states a park's network protocol can name. Matches the server's list. */
export type VisitorState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'sleep'
  | 'play'
  | 'notice';

/**
 * The network's vocabulary, mapped onto the animation controller's.
 *
 * Two vocabularies rather than one, deliberately. The wire format is small,
 * stable and about *what a creature is doing* — it has to survive the animation
 * system gaining a state without every client in the world needing to
 * understand it. `PetStateName` is an implementation detail of this codebase
 * and includes things no park would ever broadcast (`held`, `dizzy`).
 */
const STATE_MAP: Record<VisitorState, PetStateName> = {
  idle: 'idle',
  walk: 'hop',
  run: 'run',
  sit: 'sit',
  sleep: 'sleep',
  play: 'play',
  notice: 'discover',
};

export interface VisitorSpec {
  userId: string;
  username: string;
  /** The creature's own name, for the interface beside the room. */
  petName: string;
  /** From the server, read from that user's Pet row. Never from a client. */
  appearance: PetAppearanceInput;
  /** A colour, so a creature in the room can be matched to a name in the list. */
  tint: number;
}

export interface VisitorTransform {
  x: number;
  z: number;
  facing: -1 | 1;
  state: VisitorState;
}

/** Everything the scene needs to answer "who did the user just click on". */
export interface VisitorHit {
  userId: string;
  username: string;
  petName: string;
  /** Room coordinates, so the caller can decide about distance. */
  x: number;
  z: number;
}

interface Visitor {
  spec: VisitorSpec;
  view: Container;
  /** Everything but the ground tag, so the creature can lift without it. */
  art: Container;
  renderer: PetRenderer;
  animation: PetAnimationController;
  shadow: Graphics;
  /** The coloured ring on the floor that matches this visitor's list entry. */
  tag: Graphics;

  /** Where the network last said it was. */
  target: VisitorTransform;
  /** Where it is being drawn, catching up. */
  current: { x: number; z: number };
  /**
   * The last direction the network said it was heading.
   *
   * **Not a mirror.** The local creature is never flipped either — it *leans*
   * into travel (`animation/layers/Ambient.ts`, `createBodyLean`) and its gaze
   * does the rest, which is what lets an asymmetric creature keep its own
   * asymmetry instead of turning into its own reflection every time it crosses
   * the room. A visitor that mirrored would be visibly a different kind of
   * animal from the one standing next to it.
   *
   * So this is used for exactly one thing: as the tie-breaking direction for a
   * social clip when two creatures happen to be at the same screen x and
   * "which way is the other one" has no answer.
   */
  facing: -1 | 1;
  /** Seconds since the last packet, for the stale check below. */
  silence: number;
}

/**
 * How long a visitor may go unheard before it is treated as standing still.
 *
 * Not removed — that is the server's decision, arriving as a shorter `park:roster` — but a
 * creature whose owner's connection has hiccupped should stop mid-stride rather
 * than continue walking on the last velocity anybody saw.
 */
const SILENCE_SETTLE = 1.5;

export class VisitorPets {
  private readonly visitors = new Map<string, Visitor>();

  /**
   * The scene's sortable stage layer — visitors go in with the furniture so
   * depth sorting includes them.
   *
   * Written out rather than declared as a constructor parameter property: the
   * frontend compiles with `erasableSyntaxOnly`, which forbids the shorthand
   * because it is syntax that emits code rather than syntax a type stripper can
   * delete.
   */
  private readonly stage: Container;

  constructor(stage: Container) {
    this.stage = stage;
  }

  get count(): number {
    return this.visitors.size;
  }

  has(userId: string): boolean {
    return this.visitors.has(userId);
  }

  ids(): string[] {
    return [...this.visitors.keys()];
  }

  /** Where a visitor's creature currently is, for proximity and look targets. */
  positionOf(userId: string): { x: number; z: number } | null {
    const visitor = this.visitors.get(userId);
    return visitor ? { ...visitor.current } : null;
  }

  /**
   * Somebody's creature walks in.
   *
   * Idempotent: joining a park you are already in, or a repeated `park:roster`
   * arriving after a reconnect, updates the creature rather than adding a
   * second copy of it. The alternative — two rigs at the same coordinates,
   * fighting over the same z — is the visual signature of a multiplayer bug and
   * is worth one `has` check to make impossible.
   */
  add(spec: VisitorSpec, at: { x: number; z: number }): void {
    const existing = this.visitors.get(spec.userId);
    if (existing) {
      existing.spec = spec;
      const rig = existing.renderer.setAppearance(spec.appearance);
      existing.animation.setRig(rig);
      existing.tag.tint = spec.tint;
      return;
    }

    const view = new Container();
    view.label = `visitor-${spec.userId}`;

    // The creature is built first, because both the ring and the shadow are
    // sized from *its* proportions. A fixed-size ring under a creature that
    // might be a pole or a pancake is a ring that fits one of them.
    const renderer = new PetRenderer(spec.appearance);
    const width = renderer.rig.proportions.shadowWidth;

    // The ground tag, under the feet — a marking on the floor, the way the drag
    // guide is (`scenes/room/DepthGuide.ts`), not a badge on the creature. This
    // is how a creature on the lawn is matched to a name in the list beside it;
    // see `features/social/tints.ts` for why it is a ring rather than a label.
    const tag = new Graphics();
    tag.ellipse(0, 0, width * 0.62, width * 0.31);
    tag.stroke({ width: 5, color: 0xffffff, alpha: 0.95 });
    tag.tint = spec.tint;
    view.addChild(tag);

    const shadow = createContactShadow({ width, strength: 0.2 });
    view.addChild(shadow);

    const art = new Container();
    art.label = 'visitor-art';
    view.addChild(art);

    art.addChild(renderer.root);

    const visitor: Visitor = {
      spec,
      view,
      art,
      renderer,
      animation: new PetAnimationController(renderer.rig),
      shadow,
      tag,
      target: { x: at.x, z: at.z, facing: 1, state: 'idle' },
      current: { x: at.x, z: at.z },
      facing: 1,
      silence: 0,
    };

    this.visitors.set(spec.userId, visitor);
    this.stage.addChild(view);
    this.draw(visitor);
  }

  /**
   * A packet arrived.
   *
   * Records where the creature is *going*; the drawing catches up in `update`.
   * Nothing here touches the display list, because this runs on the network's
   * schedule and drawing runs on the renderer's, and mixing the two is how a
   * dropped packet becomes a dropped frame.
   */
  move(userId: string, transform: VisitorTransform): void {
    const visitor = this.visitors.get(userId);
    if (!visitor) return;

    visitor.target = transform;
    visitor.silence = 0;

    // A jump too large to have been walked. Snap rather than glide — see
    // TELEPORT_DISTANCE.
    const gap = Math.hypot(
      transform.x - visitor.current.x,
      transform.z - visitor.current.z,
    );

    if (gap > TELEPORT_DISTANCE) {
      visitor.current.x = transform.x;
      visitor.current.z = transform.z;
    }
  }

  /**
   * Two creatures did something to each other.
   *
   * Only ever called for a visitor; the local creature's half is played by the
   * scene on its own controller. Both use the same clip factory and the same
   * duration, which is what makes the two halves of an interaction line up on
   * every screen watching them.
   */
  play(
    userId: string,
    kind: SocialClipKind,
    role: SocialRole,
    towards: { x: number; z: number },
    durationMs: number,
  ): void {
    const visitor = this.visitors.get(userId);
    if (!visitor) return;

    visitor.animation.play(
      createSocialClip({
        kind,
        role,
        direction: this.screenDirection(visitor.current, towards, visitor.facing),
        duration: durationMs / 1000,
      }),
    );
  }

  /** Somebody's creature walks out. */
  remove(userId: string): void {
    const visitor = this.visitors.get(userId);
    if (!visitor) return;

    this.visitors.delete(userId);
    visitor.renderer.destroy();
    visitor.view.destroy({ children: true });
  }

  /** Everybody leaves — the park closed, or the user did. */
  clear(): void {
    for (const userId of [...this.visitors.keys()]) this.remove(userId);
  }

  /**
   * One frame.
   *
   * Called from the scene's own ticker so visitors advance on exactly the same
   * clock as the room around them — a separate `requestAnimationFrame` would
   * drift, and drift between the creature and the floor it is standing on is
   * visible immediately.
   */
  update(dt: number): void {
    for (const visitor of this.visitors.values()) {
      visitor.silence += dt;

      const before = { ...visitor.current };

      // Exponential approach rather than a fixed step: fast when far, gentle on
      // arrival, and framerate-independent, which a lerp with a constant factor
      // is not.
      const blend = 1 - Math.exp(-CATCH_UP * dt);
      visitor.current.x += (visitor.target.x - visitor.current.x) * blend;
      visitor.current.z += (visitor.target.z - visitor.current.z) * blend;

      // Screen-space velocity, not world x — a creature walking straight toward
      // the viewer has no world-x velocity at all, and driving its lean from
      // that number makes it glide with its feet still (the same reasoning as
      // `PetRoom.update`).
      const vx = dt > 0
        ? screenVelocityX(
            before.x,
            before.z,
            (visitor.current.x - before.x) / dt,
            (visitor.current.z - before.z) / dt,
          )
        : 0;

      const speed = dt > 0
        ? Math.hypot(visitor.current.x - before.x, visitor.current.z - before.z) / dt
        : 0;

      // Stale connection: stand still rather than keep walking on old velocity.
      const stale = visitor.silence > SILENCE_SETTLE;

      visitor.facing = visitor.target.facing;

      visitor.animation.setState(
        stale ? 'idle' : STATE_MAP[visitor.target.state] ?? 'idle',
      );

      visitor.animation.setMotion({
        vx: stale ? 0 : vx,
        speed: stale ? 0 : speed,
        height: 0,
        airborne: false,
        held: false,
        impact: 0,
      });

      visitor.animation.update(dt * 1000);
      this.draw(visitor);
    }
  }

  /**
   * The topmost visitor whose creature covers this screen point, or null.
   *
   * Front-to-back, so clicking where two overlap picks the one you can see —
   * the same rule `BodyView.pickAt` applies to physics bodies, reimplemented
   * here rather than reused because a visitor has no body to pass it.
   */
  pick(screenX: number, screenY: number): VisitorHit | null {
    const candidates = [...this.visitors.values()].sort(
      (a, b) => b.current.z - a.current.z,
    );

    for (const visitor of candidates) {
      const scale = scaleAt(visitor.current.z) * PET_SCALE;
      const base = project(visitor.current.x, 0, visitor.current.z);

      const height = visitor.renderer.rig.proportions.bodyHeight * scale * 1.15;
      const halfWidth = Math.max(
        22,
        visitor.renderer.rig.proportions.bodyWidth * 0.55 * scale,
      );

      if (
        screenX >= base.x - halfWidth &&
        screenX <= base.x + halfWidth &&
        screenY >= base.y - height &&
        screenY <= base.y + 10
      ) {
        return {
          userId: visitor.spec.userId,
          username: visitor.spec.username,
          petName: visitor.spec.petName,
          x: visitor.current.x,
          z: visitor.current.z,
        };
      }
    }

    return null;
  }

  /** One visitor, as the interface refers to them. */
  hitFor(userId: string): VisitorHit | null {
    const visitor = this.visitors.get(userId);
    if (!visitor) return null;

    return {
      userId,
      username: visitor.spec.username,
      petName: visitor.spec.petName,
      x: visitor.current.x,
      z: visitor.current.z,
    };
  }

  /** Which way, on screen, one point is from another. */
  screenDirection(
    from: { x: number; z: number },
    to: { x: number; z: number },
    fallback: -1 | 1 = 1,
  ): -1 | 1 {
    const a = project(from.x, 0, from.z);
    const b = project(to.x, 0, to.z);

    // Two creatures at the same screen x — one directly behind the other. There
    // is no "toward", so the creature keeps whichever way it was already going.
    if (Math.abs(b.x - a.x) < 4) return fallback;
    return b.x > a.x ? 1 : -1;
  }

  private draw(visitor: Visitor): void {
    const scale = scaleAt(visitor.current.z);
    const base = project(visitor.current.x, 0, visitor.current.z);

    visitor.view.position.set(base.x, base.y);
    visitor.view.scale.set(scale * PET_SCALE);

    // Aerial perspective, exactly as `syncEntity` applies it to everything
    // else standing in the room. Without it a visitor at the back wall is the
    // only thing in the picture at full contrast.
    const tint = depthTintOf(visitor.current.z);
    if (visitor.art.tint !== tint) visitor.art.tint = tint;

    // The near edge of the footprint, matching `BodyView.sortKeyOf`.
    visitor.view.zIndex = visitor.current.z + 20;
  }

  destroy(): void {
    this.clear();
  }
}
