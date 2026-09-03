/**
 * The three creatures the home page shows, as names only.
 *
 * A separate file with no imports, and that is the entire reason it exists.
 * The obvious way to write this is a list of `PetAppearance` objects built from
 * `ARCHETYPES` — but `Archetypes.ts` pulls in every option table in the
 * creature catalog (`BODY_TYPE_KEYS`, `EAR_TYPE_KEYS`, and eleven more), which
 * is about 39 kB of the bundle `AuthGate` works hard to keep away from a
 * visitor who has not signed in.
 *
 * So the page knows the *names*, and the chunk that can already draw creatures
 * knows what they look like (`artModule.ts`). A label is what the page needs to
 * render a chip; nothing above the renderer's boundary needs an appearance.
 */

export type HomeCreature = 'blorb' | 'bunny' | 'bee';

export const HOME_CREATURES: {
  key: HomeCreature;
  label: string;
  /** What this one is here to say, in the "your creature" section. */
  note: string;
}[] = [
  { key: 'blorb', label: 'Blorb', note: 'Yours in about a minute' },
  { key: 'bunny', label: 'Bunny', note: 'Ears, eyes, wings, hats' },
  { key: 'bee', label: 'Bee', note: 'Or something stranger' },
];
