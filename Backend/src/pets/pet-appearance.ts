/**
 * What the backend knows about a pet's appearance: almost nothing, on purpose.
 *
 * The rig lives entirely in the frontend (`/Docs/pet-anatomy.md` §8, AGENTS.md
 * — "visual assets should remain code-generated"), and the constraint table
 * that decides what a valid eye spacing is lives there too. Re-implementing
 * forty field ranges here would put the same rules in two places and guarantee
 * they drift, and the drift would be silent: the server would start rejecting
 * creatures the editor was happily drawing.
 *
 * So the server validates the properties it is actually the right place to
 * enforce — that the payload is a JSON object, that it is not enormous, that it
 * is not deeply nested, and that every number in it is finite and sane. Those
 * are storage-safety rules, not design rules. Anything past that is the
 * client's business, and the client re-clamps on read anyway.
 */

/** Serialized size cap. A full appearance is around 1 KB; this is very generous. */
const MAX_BYTES = 16 * 1024;

/** How deep the object may nest. Appearance is flat plus one level of accessories. */
const MAX_DEPTH = 4;

/**
 * Numbers outside this are not appearance values, they are attempts to break
 * the renderer.
 *
 * Comfortably above the largest legitimate value in a rig, which is a packed
 * 0xRRGGBB colour at 16777215 — not a proportion, which is why a limit picked
 * for proportions alone rejected every pink creature the first time this ran.
 */
const MAX_MAGNITUDE = 1e9;

export class AppearanceRejected extends Error {}

export type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(value: unknown, depth: number, path: string): void {
  if (depth > MAX_DEPTH) {
    throw new AppearanceRejected(`appearanceData is nested too deeply at "${path}"`);
  }

  if (value === null) return;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;

    case 'number':
      if (!Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) {
        throw new AppearanceRejected(`appearanceData."${path}" is not a usable number`);
      }
      return;

    case 'object':
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, depth + 1, `${path}[${index}]`));
        return;
      }
      for (const [key, child] of Object.entries(value as JsonObject)) {
        walk(child, depth + 1, path ? `${path}.${key}` : key);
      }
      return;

    default:
      throw new AppearanceRejected(`appearanceData."${path}" is not JSON`);
  }
}

/**
 * Check an appearance payload is safe to store, and hand it back unchanged.
 *
 * Returns the same object rather than a rewritten one: the client sent a
 * complete rig and a server that quietly dropped a field it did not recognise
 * would break every future part the frontend adds before the backend hears
 * about it.
 */
export function assertStorableAppearance(value: unknown): JsonObject {
  if (!isPlainObject(value)) {
    throw new AppearanceRejected('appearanceData must be a JSON object');
  }

  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > MAX_BYTES) {
    throw new AppearanceRejected(
      `appearanceData is ${size} bytes; the limit is ${MAX_BYTES}`,
    );
  }

  walk(value, 0, '');
  return value;
}

/**
 * The species a saved creature counts as.
 *
 * There is no species catalog yet, and the rig makes species a label rather
 * than a structure — every creature is the same blob rig with different
 * parameters (`/Docs/pet-anatomy.md` §6). So the body shape the user chose is
 * the most honest thing to record, and it stays useful if a catalog arrives.
 */
export function speciesFromAppearance(appearance: JsonObject): string {
  const bodyType = appearance.bodyType;
  return typeof bodyType === 'string' && bodyType.length <= 32 ? bodyType : 'blob';
}

/**
 * What a brand-new creature is feeling.
 *
 * Seeded here rather than accepted from the client, per 03-pet-endpoints.md §3:
 * a pet that arrives already exhausted is not something a creator should be
 * able to submit.
 */
export function seedStateData(): JsonObject {
  return { mood: 'curious', energy: 100, hunger: 0, comfort: 80, activity: 'idle' };
}

/**
 * Personality traits, fixed at creation.
 *
 * The spec randomizes omitted traits; with no personality editor in the product
 * yet, every trait is omitted, so this is the whole implementation. Seeded from
 * the appearance's own seed where there is one, so re-saving the same creature
 * twice does not produce two different temperaments.
 */
export function seedPersonalityData(appearance: JsonObject): JsonObject {
  const raw = appearance.seed;
  let state = (typeof raw === 'number' && Number.isFinite(raw) ? Math.abs(raw) : Date.now()) >>> 0;

  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return Math.round((state / 0xffffffff) * 100) / 100;
  };

  return {
    curiosity: next(),
    playfulness: next(),
    affection: next(),
    energyBias: next(),
    shyness: next(),
  };
}
