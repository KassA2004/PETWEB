import { ARCHETYPES } from '../../assets/pets/customization/Archetypes';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { HomeCreature } from './creatures';

/**
 * What the home page's three creatures actually look like.
 *
 * Below the renderer's chunk boundary, on purpose: `ARCHETYPES` reaches every
 * option table in the creature catalog, and none of that belongs in the bundle
 * a first-time visitor downloads to read a headline. The page above knows only
 * the names (`creatures.ts`); this resolves one to a creature at the point
 * something is about to draw it.
 *
 * They are the editor's own archetypes rather than three appearances written
 * out here. A second copy would be a creature that stops matching the one the
 * "Bunny" button makes the moment somebody adjusts the archetype — the exact
 * drift theme-and-design.md §20.1 exists to prevent.
 */

const cache = new Map<HomeCreature, PetAppearance>();

export function appearanceFor(creature: HomeCreature): PetAppearance {
  const hit = cache.get(creature);
  if (hit) return hit;

  // `blorb` is the default creature — the one `createPetAppearance()` makes
  // with nothing asked of it, which is what a brand-new account starts with.
  const archetype =
    creature === 'blorb'
      ? undefined
      : ARCHETYPES.find((candidate) => candidate.key === creature)?.appearance;

  const appearance = createPetAppearance(archetype);
  cache.set(creature, appearance);
  return appearance;
}
