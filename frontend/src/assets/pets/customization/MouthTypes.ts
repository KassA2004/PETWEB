/**
 * Mouth designs.
 *
 * This is the part of the system that most needed rethinking. A mouth used to
 * be drawn purely from how the creature felt, which meant every creature had
 * the same mouth; picking a shape from a menu instead would mean a grinning
 * creature stays grinning while it is thrown across the room. Neither is right.
 *
 * So a mouth type is a **shape language**, not a pose. Each preset describes
 * where its upper and lower edges go *given* a curve and an openness, and the
 * expression system supplies those two numbers every frame. A `:3` stays a `:3`
 * whether the creature is delighted or miserable — the lobes just point
 * differently (/Docs/theme-and-design.md, character vs expression).
 *
 *   bias        the curve the design carries by itself. A frown starts bent.
 *   curveGain   how much the design responds to feeling. A flat line barely
 *               moves; a wide grin moves a lot.
 *   openGain    how far it opens relative to what was asked.
 *   kind        'lips' shapes are an upper edge that can part from a lower one;
 *               'hole' shapes are an opening whose size is the expression.
 */

import { clamp, lerp } from '../../shared/shapes';
import type { Vec2 } from '../../shared/geometry';

export type MouthKind = 'lips' | 'hole';

/** Everything a mouth geometry function needs, already resolved to pixels. */
export interface MouthGeometryParams {
  /** Half the mouth's width, in pixels. */
  half: number;
  /** -1 miserable .. +1 delighted, after the design's own bias and gain. */
  curve: number;
  /** 0 shut .. 1 wide, after the design's gain. */
  open: number;
  /** -1 .. 1 sideways pull. Smirks, confusion, chewing. */
  twist: number;
  /** Stroke weight in pixels. */
  weight: number;
}

export interface MouthShape {
  label: string;
  hint: string;
  kind: MouthKind;
  bias: number;
  curveGain: number;
  openGain: number;
  /** Multiplier on the authored width — some designs are naturally small. */
  widthMul: number;
  /** 1 = fully rounded curve, lower = hard corners. Beaks and sawteeth want less. */
  tension?: number;
  /** The upper edge, left corner to right corner. */
  upper(p: MouthGeometryParams): Vec2[];
  /**
   * The lower edge, right corner back to left. Only used when the mouth is
   * open. A default is supplied, so most presets do not define one.
   */
  lower?(p: MouthGeometryParams, depth: number): Vec2[];
  /** Extra marks drawn over the mouth — stitches, a dimple, a fang notch. */
  decorate?(p: MouthGeometryParams): Vec2[][];
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

/** The standard lower edge: a bowl hanging under the upper lip. */
function bowl(p: MouthGeometryParams, depth: number): Vec2[] {
  const { half, curve, twist } = p;
  const drift = twist * half * 0.12;

  return [
    { x: half, y: 0 },
    { x: half * 0.62 + drift, y: depth * 0.72 + curve * half * 0.1 },
    { x: drift, y: depth },
    { x: -half * 0.62 + drift, y: depth * 0.72 + curve * half * 0.1 },
    { x: -half, y: 0 },
  ];
}

/** A simple bowed arc between the corners. */
function arc(p: MouthGeometryParams, bow: number, lift = 0): Vec2[] {
  const { half, twist } = p;
  const drift = twist * half * 0.18;

  return [
    { x: -half, y: -lift },
    { x: -half * 0.5 + drift * 0.5, y: bow * 0.82 },
    { x: drift, y: bow },
    { x: half * 0.5 + drift * 0.5, y: bow * 0.82 },
    { x: half, y: lift },
  ];
}

/* -------------------------------------------------------------------------- */
/* The library                                                                */
/* -------------------------------------------------------------------------- */

export const MOUTH_TYPES = {
  /** The classic arc. Bends all the way from beaming to miserable. */
  smile: {
    label: 'Smile',
    hint: 'The classic arc. Bends the whole range',
    kind: 'lips',
    bias: 0.25,
    curveGain: 1,
    openGain: 1,
    widthMul: 1,
    upper: (p) => arc(p, p.curve * p.half * 0.5),
  },

  /** Bent downward at rest. Feeling happy lifts it, but only so far. */
  frown: {
    label: 'Frown',
    hint: 'Bent down at rest. Cheering up only gets it so far',
    kind: 'lips',
    bias: -0.6,
    curveGain: 0.75,
    openGain: 1,
    widthMul: 0.94,
    upper: (p) => arc(p, p.curve * p.half * 0.46),
  },

  /** The `:3`. Two lobes and a peak between them. */
  cat: {
    label: 'Cat  :3',
    hint: 'Two lobes and a peak. Smug even when sad',
    kind: 'lips',
    bias: 0.4,
    curveGain: 0.85,
    openGain: 0.8,
    widthMul: 0.86,
    upper: (p) => {
      const bow = p.curve * p.half * 0.42;
      const drift = p.twist * p.half * 0.14;

      return [
        { x: -p.half, y: -bow * 0.2 },
        { x: -p.half * 0.52 + drift, y: bow },
        { x: drift, y: -bow * 0.42 },
        { x: p.half * 0.52 + drift, y: bow },
        { x: p.half, y: -bow * 0.2 },
      ];
    },
  },

  /** The `ω`. The cat mouth, wider and deeper. */
  omega: {
    label: 'Omega  ω',
    hint: 'The cat mouth, wider and deeper',
    kind: 'lips',
    bias: 0.35,
    curveGain: 0.9,
    openGain: 0.9,
    widthMul: 1.16,
    upper: (p) => {
      const bow = p.curve * p.half * 0.5;
      const drift = p.twist * p.half * 0.12;

      return [
        { x: -p.half, y: -bow * 0.35 },
        { x: -p.half * 0.72, y: bow * 0.5 },
        { x: -p.half * 0.4 + drift, y: bow * 1.05 },
        { x: drift, y: -bow * 0.3 },
        { x: p.half * 0.4 + drift, y: bow * 1.05 },
        { x: p.half * 0.72, y: bow * 0.5 },
        { x: p.half, y: -bow * 0.35 },
      ];
    },
  },

  /** A flat line that only just acknowledges emotion. */
  line: {
    label: 'Flat line',
    hint: 'Only just acknowledges emotion',
    kind: 'lips',
    bias: 0,
    curveGain: 0.32,
    openGain: 0.7,
    widthMul: 0.9,
    upper: (p) => arc(p, p.curve * p.half * 0.2),
  },

  /** One tiny opening. Almost nothing, which is why it is funny on a huge body. */
  dot: {
    label: 'Dot',
    hint: 'Almost nothing. Absurd on a huge body',
    kind: 'hole',
    bias: 0.1,
    curveGain: 0.5,
    openGain: 0.6,
    widthMul: 0.3,
    upper: (p) => {
      const r = p.half * (0.7 + p.open * 0.6);
      const ry = r * (0.7 + p.open * 0.8) * (1 - p.curve * 0.15);

      return [
        { x: -r, y: 0 },
        { x: 0, y: -ry },
        { x: r, y: 0 },
        { x: 0, y: ry },
      ];
    },
  },

  /** A round opening. Surprise lives here permanently. */
  round: {
    label: 'Round  o',
    hint: 'A round opening. Permanently mid-sentence',
    kind: 'hole',
    bias: 0.15,
    curveGain: 0.6,
    openGain: 1,
    widthMul: 0.62,
    upper: (p) => {
      const r = p.half * (0.85 + p.open * 0.35);
      const ry = r * (0.85 + p.open * 0.85);
      const points: Vec2[] = [];

      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        points.push({
          x: Math.cos(angle) * r + p.twist * p.half * 0.2,
          // A happy o is wider than tall; a shocked one is taller.
          y: Math.sin(angle) * ry * (1 - p.curve * 0.22),
        });
      }

      return points;
    },
  },

  /** Corner to corner, with the ends flicked up. Takes up the whole face. */
  wide: {
    label: 'Wide grin',
    hint: 'Corner to corner. Takes up the whole face',
    kind: 'lips',
    bias: 0.5,
    curveGain: 1.15,
    openGain: 1.2,
    widthMul: 1.4,
    upper: (p) => {
      const bow = p.curve * p.half * 0.34;
      const flick = Math.max(0, p.curve) * p.half * 0.16;

      return [
        { x: -p.half, y: -flick },
        { x: -p.half * 0.55, y: bow * 0.85 },
        { x: p.twist * p.half * 0.1, y: bow },
        { x: p.half * 0.55, y: bow * 0.85 },
        { x: p.half, y: -flick },
      ];
    },
  },

  /** A small, careful mouth. */
  small: {
    label: 'Small',
    hint: 'Small and careful',
    kind: 'lips',
    bias: 0.2,
    curveGain: 0.8,
    openGain: 0.7,
    widthMul: 0.56,
    upper: (p) => arc(p, p.curve * p.half * 0.55),
  },

  /** One corner up, one down. Insufferable. */
  smirk: {
    label: 'Smirk',
    hint: 'One corner up, one down. Insufferable',
    kind: 'lips',
    bias: 0.3,
    curveGain: 0.7,
    openGain: 0.8,
    widthMul: 0.94,
    upper: (p) => {
      const bow = p.curve * p.half * 0.34;

      return [
        { x: -p.half, y: p.half * 0.16 },
        { x: -p.half * 0.45, y: bow * 0.7 + p.half * 0.06 },
        { x: p.twist * p.half * 0.1, y: bow * 0.5 },
        { x: p.half * 0.5, y: bow * 0.2 - p.half * 0.1 },
        { x: p.half, y: -p.half * 0.26 },
      ];
    },
  },

  /** A tight little bud with a lower lip. */
  pout: {
    label: 'Pout',
    hint: 'A tight bud with a lower lip',
    kind: 'lips',
    bias: -0.35,
    curveGain: 0.6,
    openGain: 0.5,
    widthMul: 0.5,
    upper: (p) => arc(p, p.curve * p.half * 0.5, p.half * 0.12),
    decorate: (p) => [
      [
        { x: -p.half * 0.5, y: p.half * 0.55 },
        { x: 0, y: p.half * 0.75 },
        { x: p.half * 0.5, y: p.half * 0.55 },
      ],
    ],
  },

  /** A nervous squiggle. Reads as confusion, or as about to be sick. */
  wobble: {
    label: 'Wobble',
    hint: 'Nervous squiggle. Confused, or about to be sick',
    kind: 'lips',
    bias: -0.1,
    curveGain: 0.5,
    openGain: 0.6,
    widthMul: 1,
    upper: (p) => {
      const amp = p.half * 0.16 * (1 - Math.abs(p.curve) * 0.3);
      const base = p.curve * p.half * 0.22;
      const points: Vec2[] = [];

      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        points.push({
          x: lerp(-p.half, p.half, t),
          y: base * Math.sin(t * Math.PI) + Math.sin(t * Math.PI * 3) * amp,
        });
      }

      return points;
    },
  },

  /** Hard jagged teeth-as-outline. Nothing about this is friendly. */
  jagged: {
    label: 'Jagged',
    hint: 'Sawtooth. Nothing about this is friendly',
    kind: 'lips',
    bias: -0.2,
    curveGain: 0.6,
    openGain: 1.1,
    widthMul: 1.1,
    tension: 0.15,
    upper: (p) => {
      const base = p.curve * p.half * 0.3;
      const spike = p.half * 0.13;
      const points: Vec2[] = [];

      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        points.push({
          x: lerp(-p.half, p.half, t),
          y: base * Math.sin(t * Math.PI) + (i % 2 === 0 ? spike : -spike),
        });
      }

      return points;
    },
  },

  /** Two straight segments meeting at a point. A hard mouth. */
  beak: {
    label: 'Beak',
    hint: 'Two straight edges meeting at a point',
    kind: 'lips',
    bias: 0.1,
    curveGain: 0.55,
    openGain: 1,
    widthMul: 0.86,
    tension: 0,
    upper: (p) => [
      { x: -p.half, y: -p.curve * p.half * 0.18 },
      { x: p.twist * p.half * 0.12, y: p.curve * p.half * 0.4 },
      { x: p.half, y: -p.curve * p.half * 0.18 },
    ],
    lower: (p, depth) => [
      { x: p.half, y: -p.curve * p.half * 0.18 },
      { x: p.twist * p.half * 0.12, y: depth },
      { x: -p.half, y: -p.curve * p.half * 0.18 },
    ],
  },

  /** A flat-topped opening. Deadpan even while shouting. */
  slab: {
    label: 'Slab',
    hint: 'Flat-topped opening. Deadpan even while shouting',
    kind: 'lips',
    bias: 0,
    curveGain: 0.35,
    openGain: 1.15,
    widthMul: 0.96,
    tension: 0.35,
    upper: (p) => [
      { x: -p.half, y: 0 },
      { x: -p.half * 0.4, y: p.curve * p.half * 0.12 },
      { x: p.half * 0.4, y: p.curve * p.half * 0.12 },
      { x: p.half, y: 0 },
    ],
    lower: (p, depth) => [
      { x: p.half, y: 0 },
      { x: p.half * 0.9, y: depth },
      { x: -p.half * 0.9, y: depth },
      { x: -p.half, y: 0 },
    ],
  },

  /** A line with stitches across it. Deeply unsettling, and that is the job. */
  stitched: {
    label: 'Stitched',
    hint: 'A line with stitches. Unsettling on purpose',
    kind: 'lips',
    bias: 0,
    curveGain: 0.4,
    openGain: 0.35,
    widthMul: 1,
    upper: (p) => arc(p, p.curve * p.half * 0.22),
    decorate: (p) => {
      const marks: Vec2[][] = [];
      const bow = p.curve * p.half * 0.22;

      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const x = lerp(-p.half, p.half, t);
        const y = bow * Math.sin(t * Math.PI);
        marks.push([
          { x: x - p.weight * 0.3, y: y - p.half * 0.16 },
          { x: x + p.weight * 0.3, y: y + p.half * 0.16 },
        ]);
      }

      return marks;
    },
  },
} as const satisfies Record<string, MouthShape>;

export type MouthType = keyof typeof MOUTH_TYPES;

export function getMouthShape(type: MouthType): MouthShape {
  return MOUTH_TYPES[type] ?? MOUTH_TYPES.smile;
}

export const MOUTH_TYPE_KEYS = Object.keys(MOUTH_TYPES) as MouthType[];

/**
 * Fold a design's own character together with what the creature is feeling.
 *
 * This is the whole character-versus-expression contract in one function: the
 * design contributes a bias and a gain, the expression contributes a curve, and
 * neither can erase the other.
 */
export function resolveMouthCurve(shape: MouthShape, curve: number): number {
  return clamp(shape.bias + curve * shape.curveGain, -1.35, 1.35);
}

export { bowl as defaultLowerLip };
