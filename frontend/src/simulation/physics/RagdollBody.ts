/**
 * Bodies for the room's physics.
 *
 * Everything in the room is a small **ragdoll**: a handful of circular nodes
 * held together by distance links and a shape-matching constraint, solved by
 * position rather than by force. Nothing here is a rigid box with a rotation
 * matrix — a chair is three blobs that would very much like to stay stacked in
 * a chair shape, and mostly succeed.
 *
 * That choice buys three things single-circle bodies could not have:
 *
 *   shape      a table collides like a table — legs and a wide top — instead
 *              of like one fat circle that shoves the creature away from what
 *              is visibly thin air
 *   wobble     the top of a lamp lags behind its base, so a knock makes it
 *              rock rather than slide
 *   handling   a held creature dangles from the point you grabbed it by,
 *              because only that node is pinned and the rest hang off it
 *
 * Space
 * -----
 * The room is a 2D side view that fakes depth, so a body carries three numbers:
 *
 *   x        left/right in room coordinates
 *   depth    the ground line the body stands on. Also its draw order.
 *   height   how far the body is above that ground line.
 *
 * Nodes live in the (x, screen-y) plane the user actually sees, where
 * `screenY = depth - height`. Depth is integrated separately as a single
 * scalar — the ragdoll is solved in the visible plane, and the fake third axis
 * simply slides the whole assembly up and down the floor.
 *
 * Positions are Verlet: a node stores where it is and where it was, and its
 * velocity is the difference between the two. Constraints can therefore move a
 * node directly and the velocity follows for free, which is what makes a stack
 * of objects hold still instead of buzzing.
 */

/**
 * The solver runs at a fixed rate, independent of the display.
 *
 * Verlet integration and iterated constraints are both sensitive to a changing
 * timestep — one long frame turns a resting stack into an explosion. A fixed
 * step also means a velocity is exactly `(position - previous) / FIXED_STEP`,
 * which is what lets the rest of the app keep talking in px/s.
 */
export const FIXED_STEP = 2 / 120;

export type BodyKind = 'prop' | 'pet';

/** One circle in a body's frame, described relative to its floor contact. */
export interface NodeSpec {
  /** Sideways offset from the body's anchor. */
  ox: number;
  /** How far above the ground line the node's centre sits. */
  height: number;
  radius: number;
  /** Share of the body's mass. Defaults to an equal share. */
  mass?: number;
}

/**
 * A surface other bodies can rest on.
 *
 * This is the whole "things sit on top of and inside other things" feature: a
 * table publishes a platform, a basket publishes a container, and the world
 * treats each as a one-way floor that a body lands on from above and walks off
 * the side of.
 */
export interface SurfaceSpec {
  /** `platform` = stand on top of it. `container` = drop down inside it. */
  kind: 'platform' | 'container';
  /** Height of the top face above the object's own ground line. */
  top: number;
  /** How far either side of the object's centre the surface reaches. */
  halfWidth: number;
  /** Containers only: height of the interior floor. */
  floor?: number;
  /** How far a body sinks in. A mattress gives; a table does not. */
  give?: number;
  /** Depth difference beyond which the surface is simply somewhere else. */
  depthTolerance?: number;
}

/** What a body is currently resting on. */
export interface SupportRef {
  id: string;
  kind: 'platform' | 'container';
  /** Height of the resting surface, in room pixels above the floor line. */
  height: number;
  centreX: number;
  halfWidth: number;
  depth: number;
}

export interface BodyNode {
  x: number;
  y: number;
  /** Where the node was one step ago. Velocity is the difference. */
  px: number;
  py: number;
  radius: number;
  /** 0 for pinned nodes — held grips and fixed bodies. */
  invMass: number;
  /** Rest offset from the body's anchor, in screen space (oy negative = up). */
  ox: number;
  oy: number;
}

export interface BodyLink {
  a: number;
  b: number;
  length: number;
  stiffness: number;
}

export interface PhysicsBody {
  id: string;
  kind: BodyKind;

  // --- The ragdoll --------------------------------------------------------
  nodes: BodyNode[];
  links: BodyLink[];
  /** Lowest node — the one that touches the ground. */
  baseIndex: number;
  /** Highest node — the one a hand naturally grabs. */
  topIndex: number;
  /** Node the pointer is holding, while `held`. */
  gripIndex: number;
  /** How hard the frame fights being deformed, 0 rag .. 1 rigid. */
  rigidity: number;
  /** How hard it rights itself once knocked over, per second. */
  upright: number;

  // --- Derived every step, read by everything else -------------------------
  x: number;
  depth: number;
  height: number;
  vx: number;
  vDepth: number;
  vHeight: number;
  /** How far the frame is tilted, or how far a rolling thing has rolled. */
  angle: number;

  // --- Fixed properties ----------------------------------------------------
  /** Footprint radius: what picking, perception and the brain measure with. */
  radius: number;
  mass: number;
  /** 0 = lands dead, 1 = bounces forever. */
  restitution: number;
  /** How quickly ground contact bleeds off horizontal speed. */
  friction: number;
  /** Round things roll; everything else tips and rights itself. */
  rolls: boolean;
  /** Visual spin for single-node props tumbling through the air. */
  spin: number;
  /** What this body offers other bodies to rest on. */
  surface: SurfaceSpec | null;

  // --- State ---------------------------------------------------------------
  /** Held bodies hang off the pointer; gravity still acts on the rest. */
  held: boolean;
  /** Fixed bodies never move: a rug underfoot, a clock on the wall. */
  fixed: boolean;
  /** True while the body is sitting still and can be skipped. */
  resting: boolean;
  /** What it is standing on, or null for the floor. */
  support: SupportRef | null;
  /**
   * One body id this one is currently allowed to pass through.
   *
   * Climbing. A creature getting onto a chair puts its paws on the seat and
   * scrambles; it does not clear the back of the chair from a standing jump.
   * Rather than model paws, the climber is let through the thing it is
   * climbing for as long as the climb lasts, and the one-way surface catches
   * it on the way down.
   */
  ignore: string | null;
  /** Height of that surface — where its contact shadow belongs. */
  supportHeight: number;
  /** Where the pointer is dragging the grip node to. */
  grip: { x: number; y: number };
  /** Seconds of stillness so far, for the sleep test. */
  still: number;
}

export interface BodyOptions {
  id: string;
  kind?: BodyKind;
  x: number;
  depth: number;
  height?: number;
  /** Footprint radius, and the fallback frame if none is given. */
  radius: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  fixed?: boolean;
  rolls?: boolean;
  /** The ragdoll's circles. A single circle if omitted. */
  frame?: NodeSpec[];
  rigidity?: number;
  upright?: number;
  surface?: SurfaceSpec | null;
}

export function createBody(options: BodyOptions): PhysicsBody {
  const frame: NodeSpec[] =
    options.frame && options.frame.length > 0
      ? options.frame
      : [{ ox: 0, height: options.radius, radius: options.radius }];

  const height = options.height ?? 0;
  const mass = options.mass ?? 1;
  const fixed = options.fixed ?? false;

  const shares = frame.map((spec) => spec.mass ?? 1);
  const shareTotal = shares.reduce((sum, share) => sum + share, 0);

  const nodes: BodyNode[] = frame.map((spec, index) => {
    const x = options.x + spec.ox;
    // A node whose rest position is below the floor can never be satisfied:
    // the floor pushes it up, the links pull it back down, and the pair of
    // them ratchet the object slowly across the room. Lift it instead.
    const y = options.depth - height - Math.max(spec.height, spec.radius);
    const share = (shares[index] / shareTotal) * mass;

    return {
      x,
      y,
      px: x,
      py: y,
      radius: spec.radius,
      invMass: fixed ? 0 : 1 / Math.max(0.05, share),
      ox: spec.ox,
      oy: -Math.max(spec.height, spec.radius),
    };
  });

  const rigidity = options.rigidity ?? 0.85;
  const links: BodyLink[] = [];

  // Every pair, not just neighbours: three nodes wired in a triangle keep
  // their shape, where a chain of three folds flat the first time it lands.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      links.push({
        a: i,
        b: j,
        length: Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y),
        stiffness: rigidity,
      });
    }
  }

  let baseIndex = 0;
  let topIndex = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].oy > nodes[baseIndex].oy) baseIndex = i;
    if (nodes[i].oy < nodes[topIndex].oy) topIndex = i;
  }

  return {
    id: options.id,
    kind: options.kind ?? 'prop',

    nodes,
    links,
    baseIndex,
    topIndex,
    gripIndex: topIndex,
    rigidity,
    upright: options.upright ?? 6,

    x: options.x,
    depth: options.depth,
    height,
    vx: 0,
    vDepth: 0,
    vHeight: 0,
    angle: 0,

    radius: options.radius,
    mass,
    restitution: options.restitution ?? 0.42,
    friction: options.friction ?? 4.5,
    rolls: options.rolls ?? false,
    spin: 0,
    surface: options.surface ?? null,

    held: false,
    ignore: null,
    fixed,
    // Something dropped in from above has to fall before it can rest.
    resting: fixed || height <= 0,
    support: null,
    supportHeight: 0,
    grip: { x: options.x, y: options.depth - height },
    still: 0,
  };
}

// --- Reading and writing motion ---------------------------------------------

/**
 * Velocity in px/s.
 *
 * Verlet stores no velocity of its own, so this is the only definition of one:
 * how far the node moved during the last fixed step.
 */
export function nodeVelocity(node: BodyNode): { vx: number; vy: number } {
  return {
    vx: (node.x - node.px) / FIXED_STEP,
    vy: (node.y - node.py) / FIXED_STEP,
  };
}

/** Give the whole body a velocity, in px/s. `vHeight` is positive upward. */
export function setBodyVelocity(
  body: PhysicsBody,
  velocity: { vx?: number; vHeight?: number; vDepth?: number },
): void {
  if (velocity.vDepth !== undefined) body.vDepth = velocity.vDepth;

  const { vx, vHeight } = velocity;
  if (vx === undefined && vHeight === undefined) return;

  for (const node of body.nodes) {
    const current = nodeVelocity(node);
    const nextX = vx ?? current.vx;
    const nextY = vHeight === undefined ? current.vy : -vHeight;
    node.px = node.x - nextX * FIXED_STEP;
    node.py = node.y - nextY * FIXED_STEP;
  }
}

/** Add to the body's velocity, in px/s. */
export function addBodyVelocity(
  body: PhysicsBody,
  velocity: { vx?: number; vHeight?: number; vDepth?: number },
): void {
  if (velocity.vDepth !== undefined) body.vDepth += velocity.vDepth;

  const vx = velocity.vx ?? 0;
  const vHeight = velocity.vHeight ?? 0;
  if (vx === 0 && vHeight === 0) return;

  for (const node of body.nodes) {
    node.px -= vx * FIXED_STEP;
    node.py += vHeight * FIXED_STEP;
  }
}

/** Move a body bodily, without giving it any velocity. */
export function placeBody(
  body: PhysicsBody,
  position: { x?: number; depth?: number; height?: number },
): void {
  const dx = position.x === undefined ? 0 : position.x - body.x;
  const nextDepth = position.depth ?? body.depth;
  const nextHeight = position.height ?? body.height;
  const dy = nextDepth - nextHeight - (body.depth - body.height);

  for (const node of body.nodes) {
    node.x += dx;
    node.px += dx;
    node.y += dy;
    node.py += dy;
  }

  body.x += dx;
  body.depth = nextDepth;
  body.height = nextHeight;
}

/** Slide the whole assembly along the fake depth axis. */
export function shiftDepth(body: PhysicsBody, delta: number): void {
  body.depth += delta;
  for (const node of body.nodes) {
    node.y += delta;
    node.py += delta;
  }
}

/**
 * Re-read the body's public numbers from its nodes.
 *
 * The nodes are the truth; `x`, `height`, `angle` and the velocities are a
 * convenience for everything that would rather not know about ragdolls.
 *
 * `x` is the *anchor* — the floor contact point the artwork is drawn from —
 * recovered from where the nodes have ended up and how far the frame has
 * tilted. Reading it off any single node instead would hang a three-node bed's
 * artwork eighty pixels to the left of the bed.
 */
export function syncBody(body: PhysicsBody): void {
  const { nodes } = body;
  const count = nodes.length;

  let cx = 0;
  let cy = 0;
  let rx = 0;
  let ry = 0;
  let vx = 0;
  let vy = 0;

  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
    rx += node.ox;
    ry += node.oy;
    const velocity = nodeVelocity(node);
    vx += velocity.vx;
    vy += velocity.vy;
  }

  cx /= count;
  cy /= count;
  rx /= count;
  ry /= count;

  body.vx = vx / count;
  body.vHeight = -vy / count;

  if (count > 1) {
    body.angle = frameAngle(body);
  } else if (body.rolls) {
    body.angle += (body.vx / Math.max(1, nodes[0].radius)) * FIXED_STEP;
  } else {
    body.angle += body.spin * FIXED_STEP;
  }

  // Undo the frame's own offset and tilt to find where its anchor must be.
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);

  body.x = cx - (rx * cos - ry * sin);
  body.height = body.depth - (cy - (rx * sin + ry * cos));
}

/**
 * How far the frame is currently tilted away from its rest shape.
 *
 * The 2D Procrustes fit: the angle that best maps the rest offsets onto where
 * the nodes have actually ended up. One number describes the whole assembly's
 * lean, which is exactly what the renderer wants.
 */
export function frameAngle(body: PhysicsBody): number {
  const { nodes } = body;

  let cx = 0;
  let cy = 0;
  let rx = 0;
  let ry = 0;

  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
    rx += node.ox;
    ry += node.oy;
  }

  cx /= nodes.length;
  cy /= nodes.length;
  rx /= nodes.length;
  ry /= nodes.length;

  let cross = 0;
  let dot = 0;

  for (const node of nodes) {
    const ox = node.ox - rx;
    const oy = node.oy - ry;
    const qx = node.x - cx;
    const qy = node.y - cy;
    cross += ox * qy - oy * qx;
    dot += ox * qx + oy * qy;
  }

  if (cross === 0 && dot === 0) return 0;
  return Math.atan2(cross, dot);
}

/**
 * Pull the nodes back toward the frame's shape, optionally rotated upright.
 *
 * This is shape matching: fit the rest shape onto the current one, then move
 * each node a fraction of the way to where it *should* be. It is what keeps a
 * table looking like a table, and biasing the fitted angle back toward zero is
 * what stands a knocked-over lamp back up.
 */
export function matchShape(
  body: PhysicsBody,
  stiffness: number,
  uprightBias: number,
): void {
  const { nodes } = body;
  if (nodes.length < 2) return;

  let cx = 0;
  let cy = 0;
  let rx = 0;
  let ry = 0;

  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
    rx += node.ox;
    ry += node.oy;
  }

  cx /= nodes.length;
  cy /= nodes.length;
  rx /= nodes.length;
  ry /= nodes.length;

  const angle = frameAngle(body) * (1 - uprightBias);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (const node of nodes) {
    if (node.invMass === 0) continue;

    const ox = node.ox - rx;
    const oy = node.oy - ry;

    const targetX = cx + ox * cos - oy * sin;
    const targetY = cy + ox * sin + oy * cos;

    node.x += (targetX - node.x) * stiffness;
    node.y += (targetY - node.y) * stiffness;
  }
}
