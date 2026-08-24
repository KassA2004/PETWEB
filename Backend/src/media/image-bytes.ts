import type { AcceptedMime } from './media-paths';

/**
 * What an uploaded file actually is, and what it should not carry with it.
 *
 * Two jobs, both of which have to happen before anything is written to disk.
 *
 * **Sniff the real type.** A client-supplied `Content-Type` is a claim, and the
 * filename extension is a weaker one. Both are trivially wrong — by accident
 * when a phone mislabels a photo, and on purpose when somebody uploads an HTML
 * file called `cat.png` and links a victim to it from a domain that also serves
 * the application. The first bytes of a file are the only part that has to be
 * true for it to be that format at all.
 *
 * **Strip the camera's notes.** A photo off a phone carries EXIF, and EXIF
 * routinely carries GPS coordinates. The user attaching a picture to "went for
 * a walk" is not consenting to publish where they walked, and these files are
 * served from unguessable-but-public paths (09-media-endpoints.md §4). Dropping
 * the metadata is cheap and the failure mode of keeping it is somebody's home
 * address.
 */

interface Signature {
  mime: AcceptedMime;
  /** Bytes that must match at `offset`. */
  magic: number[];
  offset: number;
  /** A second run of bytes that must also match, for containers like WebP. */
  also?: { magic: number[]; offset: number };
}

const SIGNATURES: Signature[] = [
  { mime: 'image/png', offset: 0, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', offset: 0, magic: [0xff, 0xd8, 0xff] },
  {
    mime: 'image/webp',
    offset: 0,
    magic: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    also: { offset: 8, magic: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
  },
];

function matches(buffer: Buffer, magic: number[], offset: number): boolean {
  if (buffer.length < offset + magic.length) return false;
  return magic.every((byte, index) => buffer[offset + index] === byte);
}

/** The image type these bytes really are, or null if they are not an accepted image. */
export function sniffImageMime(buffer: Buffer): AcceptedMime | null {
  for (const signature of SIGNATURES) {
    if (!matches(buffer, signature.magic, signature.offset)) continue;
    if (signature.also && !matches(buffer, signature.also.magic, signature.also.offset)) {
      continue;
    }
    return signature.mime;
  }

  return null;
}

/**
 * A JPEG with its APPn metadata segments removed.
 *
 * JPEG is a stream of marker segments — `0xFF <marker> <2-byte length> <data>` —
 * running until the start-of-scan marker, after which the entropy-coded image
 * data runs to the end. `APP0`..`APP15` (0xE0..0xEF) hold JFIF, EXIF, GPS, XMP
 * and colour-profile records; everything the decoder needs to reconstruct the
 * picture lives in the other markers. Dropping the APPn segments therefore
 * yields a smaller, still-valid JPEG with the camera's notes gone.
 *
 * Deliberately conservative: anything that does not parse cleanly as a marker
 * stream is returned untouched rather than half-rewritten. A file this cannot
 * understand is a file it has no business editing.
 *
 * PNG and WebP metadata chunks are NOT stripped — see the storage note in
 * /Docs/API-endpoints/09-media-endpoints.md. Doing those properly, along with
 * the re-encode and the thumbnail the spec asks for, is `sharp`'s job, and
 * `sharp` is not in TECH_STACK.md.
 */
export function stripJpegMetadata(buffer: Buffer): Buffer {
  if (!matches(buffer, [0xff, 0xd8], 0)) return buffer;

  const kept: Buffer[] = [buffer.subarray(0, 2)];
  let at = 2;

  while (at + 3 < buffer.length) {
    if (buffer[at] !== 0xff) return buffer; // Not where a marker should be.

    const marker = buffer[at + 1];

    // Standalone markers: no length, no payload.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(buffer.subarray(at, at + 2));
      at += 2;
      continue;
    }

    // Start of scan: everything from here to the end is image data.
    if (marker === 0xda) {
      kept.push(buffer.subarray(at));
      return Buffer.concat(kept);
    }

    const length = buffer.readUInt16BE(at + 2);
    // A segment's length field counts itself, so anything under two is corrupt.
    if (length < 2 || at + 2 + length > buffer.length) return buffer;

    const isAppSegment = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;

    if (!isAppSegment && !isComment) {
      kept.push(buffer.subarray(at, at + 2 + length));
    }

    at += 2 + length;
  }

  // Ran off the end without finding the scan — not a shape worth rewriting.
  return buffer;
}

/** Whatever cleaning is available for this type. */
export function cleanImage(buffer: Buffer, mime: AcceptedMime): Buffer {
  return mime === 'image/jpeg' ? stripJpegMetadata(buffer) : buffer;
}
