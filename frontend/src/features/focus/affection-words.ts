import type { AffectionLevel } from './api';

/**
 * The one sentence the interface is allowed to say about the relationship.
 *
 * Everything real about affection is in the room: whether the creature comes
 * over, whether it starts a game, whether it turns away from the cursor. This
 * is a caption under that, and it exists because a behaviour you have not seen
 * yet is invisible — somebody who signs in to a creature keeping its distance
 * deserves a hint that it is *about something*, not a bug.
 *
 * Three rules it follows, and each one is a thing the product must not become:
 *
 * **No number, ever.** Not a percentage, not a bar, not "+3". The moment a
 * relationship has a score, following through stops being the point and the
 * score becomes it.
 *
 * **It never asks for anything.** No "focus today to keep Blorb happy". The
 * low-end lines describe the creature, not a debt — the difference between a
 * pet that misses you and a notification that guilts you.
 *
 * **It is never cruel.** The bottom of the scale is a small creature keeping to
 * itself, which is sad in the way a cartoon is sad. It is never disgust, never
 * blame, and never about the user's character.
 */
const LINES: Record<AffectionLevel, (name: string) => string> = {
  'very-low': (name) => `${name} has been keeping to itself lately.`,
  low: (name) => `${name} is a little distant.`,
  neutral: (name) => `${name} is pottering about, taking you as it finds you.`,
  happy: (name) => `${name} seems pleased you are here.`,
  affectionate: (name) => `${name} has started following you around.`,
  'very-affectionate': (name) => `${name} is completely, ridiculously devoted to you.`,
};

export function affectionLine(petName: string, level: AffectionLevel): string {
  return (LINES[level] ?? LINES.neutral)(petName);
}
