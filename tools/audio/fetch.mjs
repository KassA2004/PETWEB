/**
 * The audio fetcher: how every sound in this product got here.
 *
 * The room used to be entirely synthesised — every bounce, every gull, every
 * note, built out of oscillators at run time (`frontend/src/lib/audio`). That
 * was the right first answer and it is the wrong final one. Filtered noise is a
 * convincing *wind* and an unconvincing *sea*; a sine with a falling pitch is a
 * fine placeholder for a ball and nothing like a ball; and a pentatonic note
 * generator is, after twenty minutes, exactly as interesting as a pentatonic
 * note generator. The synthesis stays as the fallback (see `lib/audio/samples.ts`),
 * and what it falls back *from* is this.
 *
 * ## Why a script rather than a folder somebody dragged files into
 *
 * Because the provenance is the licence. Every file here is either Pixabay
 * Content Licence (free for commercial use, no attribution required) or CC0,
 * and the only way that stays true after the tenth "just one more sound" is if
 * the list of sources is a checked-in file and the download is a command
 * anybody can re-run. `sources.json` is the list; this reads it, fetches,
 * transcodes, and writes `CREDITS.md` from the same rows — so the credits
 * cannot drift from what actually shipped.
 *
 * It is also the only way the *processing* is reproducible, and the processing
 * is most of the work. Levels are the whole problem with a sample library:
 * thirty files recorded by thirty people arrive thirty different distances from
 * the microphone, and a mix table (`AudioBus.DEFAULT_LEVELS`) means nothing if
 * a chirp lands fifteen decibels above a knock. So nothing is used as
 * downloaded — each file is trimmed, level-matched to a stated target and
 * re-encoded, and re-running the script reproduces the same result.
 *
 * ## The commands
 *
 * ```bash
 * node tools/audio/fetch.mjs sync                     # everything in sources.json
 * node tools/audio/fetch.mjs sync ball music          # one id, or one group
 * node tools/audio/fetch.mjs search pixabay "cozy lofi"
 * node tools/audio/fetch.mjs search freesound "cat purr" --max=3
 * node tools/audio/fetch.mjs resolve https://pixabay.com/music/.../
 * ```
 *
 * The two `search` commands exist because picking assets is the part a person
 * has to do, and doing it in a browser and pasting URLs back is how a source
 * list ends up pinned to a track that has since been taken down. They print
 * exactly the fields `sources.json` wants.
 *
 * ## Where the two libraries differ
 *
 * ```text
 *   Pixabay     scraped, because the public API covers images and video and
 *               not music. The track page carries one cdn.pixabay.com URL and
 *               that is what is downloaded — with a browser's User-Agent and a
 *               Referer, without which the CDN answers 403
 *   Freesound   scraped for the opposite reason: the API needs a key per
 *               developer, and the thing a key buys — search — is on the public
 *               search page anyway. What is downloaded is the *preview*
 *               (cdn.freesound.org/previews/...-hq.mp3), which needs no account.
 *               Every search is filtered to `license:"Creative Commons 0"`
 * ```
 *
 * A preview is 128 kbps rather than the original master, and for a 400
 * millisecond impact that is transparent — it is re-encoded to 16-bit PCM at
 * 32 kHz here regardless, which is a lower ceiling than the preview's own.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'frontend/public/audio');
const SOURCES = join(HERE, 'sources.json');

/**
 * Where downloads are cached.
 *
 * Kept between runs and keyed by the URL, so re-tuning a trim point does not
 * re-download forty megabytes. Gitignored: it is the *unprocessed* material,
 * and what belongs in the repository is what ships.
 */
const WORK = join(HERE, '.work');

/**
 * A browser's User-Agent.
 *
 * Both CDNs refuse a request that does not look like one — Pixabay's with a 403
 * on the audio itself, which is the failure that looks like a dead URL and is
 * not one.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

/* --- the network -------------------------------------------------------- */

/**
 * Fetching, through `curl` rather than through `fetch`.
 *
 * Not a preference, and worth the note so nobody "modernises" it back. Pixabay
 * sits behind a bot filter that refuses Node's built-in fetch with a 403 *no
 * matter what headers it sends* — the same URL, the same User-Agent, the same
 * Accept, from `curl`, is a 200. What differs is below the headers: the two
 * clients present different TLS handshakes, and the filter reads that.
 *
 * `curl` ships with Windows 10+, macOS and every Linux worth the name, so the
 * dependency costs nothing that ffmpeg has not already cost.
 */
async function curl(args) {
  const { stdout } = await run(
    'curl',
    ['--silent', '--show-error', '--location', '--fail', '--max-time', '180', ...args],
    { maxBuffer: 1 << 28, encoding: 'buffer' },
  );
  return stdout;
}

async function getText(url, referer) {
  const out = await curl([
    '-A', UA,
    ...(referer ? ['-e', referer] : []),
    url,
  ]).catch((error) => {
    throw new Error(`GET ${url} -> ${error.stderr?.toString().trim() || error.message}`);
  });

  return out.toString('utf8');
}

async function download(url, to, referer) {
  await mkdir(dirname(to), { recursive: true });
  await curl([
    '-A', UA,
    ...(referer ? ['-e', referer] : []),
    '-o', to,
    url,
  ]).catch((error) => {
    throw new Error(`GET ${url} -> ${error.stderr?.toString().trim() || error.message}`);
  });
}

/* --- Pixabay ------------------------------------------------------------- */

/** Track pages matching a query, in the order the site ranks them. */
async function searchPixabay(query) {
  const html = await getText(
    `https://pixabay.com/music/search/${encodeURIComponent(query)}/`,
    'https://pixabay.com/',
  );

  const seen = new Set();
  const results = [];

  for (const match of html.matchAll(/href="(\/music\/([a-z0-9-]+-(\d+))\/)"/g)) {
    const [, path, slug, id] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ id, slug, url: `https://pixabay.com${path}` });
  }

  return results;
}

/**
 * The one downloadable URL on a track page.
 *
 * `sources.json` pins the *page* rather than this, because the CDN link carries
 * a content hash that changes when the uploader re-masters the track: a pinned
 * CDN link rots silently, a pinned page does not.
 */
async function resolvePixabay(pageUrl) {
  const html = await getText(pageUrl, 'https://pixabay.com/music/');
  const match = html.match(
    /https:\/\/cdn\.pixabay\.com\/download\/audio\/[^"'\\ ]+\.mp3[^"'\\ ]*/,
  );
  if (!match) throw new Error(`No audio URL on ${pageUrl}`);

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? pageUrl;
  return { url: match[0].replace(/&amp;/g, '&'), title };
}

/* --- Freesound ----------------------------------------------------------- */

/**
 * CC0 sounds matching a query, most-downloaded first.
 *
 * The licence filter is not a parameter and is not optional: this project takes
 * CC0 from Freesound and nothing else, because every other Creative Commons
 * tier carries an attribution obligation that a game has no good place to
 * discharge and a silent violation is an easy place to end up.
 *
 * Sorted by downloads because there is no way to audition forty results from a
 * script, and "what have forty thousand other people already used" is the best
 * proxy for "clean, trimmed, and what it says it is" that the listing carries.
 */
async function searchFreesound(query, { minDuration = 0, maxDuration = 1e9 } = {}) {
  const url =
    'https://freesound.org/search/?q=' +
    encodeURIComponent(query) +
    '&f=' +
    encodeURIComponent('license:"Creative Commons 0"') +
    '&s=downloads_desc';

  const html = await getText(url, 'https://freesound.org/');
  const results = [];

  for (const block of html.matchAll(
    /<div\s+class="bw-player"([\s\S]{0,1600}?)tabindex="0">/g,
  )) {
    const attrs = block[1];
    const at = (name) => attrs.match(new RegExp(`data-${name}="([^"]*)"`))?.[1];

    const id = at('sound-id');
    const mp3 = at('mp3');
    if (!id || !mp3) continue;

    const duration = Number(at('duration') ?? '0');
    if (duration < minDuration || duration > maxDuration) continue;

    results.push({
      id,
      title: at('title'),
      author: at('username'),
      duration: Number(duration.toFixed(2)),
      downloads: Number(at('num-downloads') ?? '0'),
      page: `https://freesound.org/s/${id}/`,
      // The high-quality preview: the same recording at 128 kbps rather than 64.
      url: mp3.replace('-lq.mp3', '-hq.mp3'),
    });
  }

  return results;
}

/* --- ffmpeg -------------------------------------------------------------- */

async function ffmpeg(args) {
  return run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    maxBuffer: 1 << 26,
  });
}

async function ffprobe(file) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    file,
  ]);
  return Number(stdout.trim());
}

/**
 * How loud a file actually is, in LUFS.
 *
 * EBU R128 integrated loudness rather than peak, because peak is not how loud
 * something sounds: a bright click can peak at 0 dBFS and vanish under a pad
 * that peaks at -6. Everything long-form is matched on this and everything
 * short is matched on peak — R128's integration window is longer than most of
 * the one-shots here, so it has nothing to measure on them.
 */
async function integratedLoudness(file) {
  const { stderr } = await run(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-af',
      'ebur128=framelog=quiet',
      '-f',
      'null',
      '-',
    ],
    { maxBuffer: 1 << 26 },
  ).catch((error) => error);

  const match = String(stderr).match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  if (!match) throw new Error(`Could not measure loudness of ${file}`);
  return Number(match[1]);
}

/** The loudest single sample, in dBFS. */
async function peakLevel(file) {
  const { stderr } = await run(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { maxBuffer: 1 << 26 },
  ).catch((error) => error);

  const match = String(stderr).match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  if (!match) throw new Error(`Could not measure peak of ${file}`);
  return Number(match[1]);
}

/* --- the three shapes a file can be given -------------------------------- */

/**
 * A one-shot: trimmed to the sound itself, peak-matched, 16-bit PCM.
 *
 * WAV rather than MP3, for a reason that is about timing rather than quality.
 * An MP3 decoder pads the start of every file with the encoder's delay, and
 * `decodeAudioData` does not reliably strip it; twenty milliseconds of nothing
 * in front of a click is a click that does not land on the press. These files
 * are tens of kilobytes each, and the saving is not worth the latency.
 *
 * Head and tail silence goes first — a recordist's silence is not the product's
 * timing — and then a 4 ms fade in and a short fade out, because a waveform cut
 * at a non-zero sample is a click of its own.
 */
async function makeOneShot(input, output, spec) {
  const trimmed = join(WORK, `trim-${process.pid}.wav`);
  const rate = String(spec.rate ?? 32000);

  const chain = [
    'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.01:detection=peak',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02:detection=peak',
    'areverse',
    ...(spec.filters ?? []),
  ];

  await ffmpeg([
    ...(spec.start !== undefined ? ['-ss', String(spec.start)] : []),
    ...(spec.duration !== undefined ? ['-t', String(spec.duration)] : []),
    '-i',
    input,
    '-af',
    chain.join(','),
    '-ac',
    '1',
    '-ar',
    rate,
    trimmed,
  ]);

  const length = await ffprobe(trimmed);
  const peak = await peakLevel(trimmed);
  const target = spec.peakDb ?? -1;
  const fadeOut = Math.min(0.025, length / 4);

  await ffmpeg([
    '-i',
    trimmed,
    '-af',
    [
      `volume=${(target - peak).toFixed(2)}dB`,
      'afade=t=in:st=0:d=0.004',
      `afade=t=out:st=${Math.max(0, length - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    ].join(','),
    '-ac',
    '1',
    '-ar',
    rate,
    '-c:a',
    'pcm_s16le',
    output,
  ]);

  await rm(trimmed, { force: true });
  return { seconds: Number(length.toFixed(3)) };
}

/**
 * A loop: a clip that plays end to end for ever without a seam.
 *
 * The trick is old and worth writing down, because the obvious version does not
 * work. Cutting `[0, D]` out of a recording and setting `loop = true` puts the
 * sample at D next to the sample at 0, and those two are unrelated — the join
 * is a click, or at best an audible lurch in the noise floor. So the clip is
 * assembled out of order:
 *
 * ```text
 *   source   |--X--|--------- body ---------|--X--|
 *              head                          tail
 *
 *   output   |--------- body ---------|  tail x head  |
 *                                         crossfade
 * ```
 *
 * The output ends part-way through material that continues at its own start, so
 * the loop point is a crossfade rather than a cut — and the total length is
 * exactly D, because the crossfade consumes both copies of X.
 */
async function makeLoop(input, output, spec) {
  const seconds = spec.duration ?? 24;
  const fade = spec.crossfade ?? 2.5;
  const start = spec.start ?? 0;

  const seamless = join(WORK, `loop-${process.pid}.wav`);

  await ffmpeg([
    '-i',
    input,
    '-filter_complex',
    [
      '[0:a]asplit=3[a][b][c]',
      `[a]atrim=${start + fade}:${start + seconds},asetpts=N/SR/TB[body]`,
      `[b]atrim=${start + seconds}:${start + seconds + fade},asetpts=N/SR/TB[tail]`,
      `[c]atrim=${start}:${start + fade},asetpts=N/SR/TB[head]`,
      `[tail][head]acrossfade=d=${fade}:c1=tri:c2=tri[join]`,
      '[body][join]concat=n=2:v=0:a=1[out]',
    ].join(';'),
    '-map',
    '[out]',
    '-ac',
    '2',
    '-ar',
    '44100',
    seamless,
  ]);

  await encodeLong(seamless, output, spec);
  await rm(seamless, { force: true });
  return { seconds };
}

/** A track: played once, in a playlist. Long, so it is streamed rather than decoded. */
async function makeTrack(input, output, spec) {
  const trimmed = join(WORK, `track-${process.pid}.wav`);

  await ffmpeg([
    ...(spec.start !== undefined ? ['-ss', String(spec.start)] : []),
    ...(spec.duration !== undefined ? ['-t', String(spec.duration)] : []),
    '-i',
    input,
    // Faded in, because the playlist crossfades between tracks and one that
    // starts on a downbeat fights the one it is arriving over.
    '-af',
    'afade=t=in:st=0:d=2',
    '-ac',
    '2',
    '-ar',
    '44100',
    trimmed,
  ]);

  const length = await ffprobe(trimmed);
  const faded = join(WORK, `track-out-${process.pid}.wav`);

  await ffmpeg([
    '-i',
    trimmed,
    '-af',
    `afade=t=out:st=${Math.max(0, length - 4).toFixed(2)}:d=4`,
    faded,
  ]);

  await encodeLong(faded, output, spec);
  await rm(trimmed, { force: true });
  await rm(faded, { force: true });
  return { seconds: Number(length.toFixed(2)) };
}

/**
 * Level-match and encode anything long.
 *
 * A measured constant gain plus a limiter, rather than `loudnorm`'s own
 * single-pass mode: single-pass loudnorm makes dynamic decisions across the
 * file, which on a quiet ambience bed audibly pumps the noise floor. A constant
 * gain moves the whole file and changes nothing else, and the limiter is only
 * there to catch the one transient that would clip after it.
 */
async function encodeLong(input, output, spec) {
  const measured = await integratedLoudness(input);
  const target = spec.lufs ?? -20;

  await ffmpeg([
    '-i',
    input,
    '-af',
    [
      `volume=${(target - measured).toFixed(2)}dB`,
      'alimiter=limit=0.95:level=false',
    ].join(','),
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${spec.bitrate ?? 96}k`,
    '-ar',
    '44100',
    '-ac',
    '2',
    output,
  ]);
}

/* --- sync ---------------------------------------------------------------- */

const SHAPES = { oneshot: makeOneShot, loop: makeLoop, track: makeTrack };

async function locate(entry) {
  if (entry.source === 'pixabay') {
    const { url } = await resolvePixabay(entry.page);
    return { url, referer: entry.page };
  }

  if (entry.source === 'freesound') {
    return { url: entry.url, referer: entry.page ?? 'https://freesound.org/' };
  }

  throw new Error(`Unknown source "${entry.source}"`);
}

async function sync(only) {
  const catalogue = JSON.parse(await readFile(SOURCES, 'utf8'));
  const wanted = catalogue.assets.filter(
    (entry) =>
      only.length === 0 || only.includes(entry.id) || only.includes(entry.group),
  );

  if (wanted.length === 0) {
    console.error(`Nothing in sources.json matched: ${only.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(WORK, { recursive: true });
  const made = [];

  for (const entry of wanted) {
    process.stdout.write(`${entry.id.padEnd(20)} `);

    try {
      const { url, referer } = await locate(entry);
      const cached = join(WORK, createHash('sha1').update(url).digest('hex').slice(0, 16));

      if (!existsSync(cached)) await download(url, cached, referer);

      const output = join(OUT, entry.file);
      await mkdir(dirname(output), { recursive: true });

      const result = await SHAPES[entry.shape](cached, output, entry);
      made.push({ ...entry, ...result });
      console.log(`ok   ${String(result.seconds).padStart(7)}s   ${entry.file}`);
    } catch (error) {
      console.log(`FAILED  ${error.message}`);
      process.exitCode = 1;
    }
  }

  await writeCredits(catalogue, made);
}

/**
 * The credits, written from the rows that were actually downloaded.
 *
 * Not maintained by hand, and not written from `sources.json` either — from
 * what succeeded, so a file that failed to fetch cannot be credited as though
 * it shipped.
 */
async function writeCredits(catalogue, made) {
  if (made.length === 0) return;

  const path = join(OUT, 'CREDITS.md');

  // Only a full sync may rewrite the whole file. A partial one knows nothing
  // about the entries it skipped, and would credit the room to four sounds.
  if (made.length !== catalogue.assets.length && existsSync(path)) {
    console.log('\n(partial sync: CREDITS.md left alone — re-run with no arguments to rebuild it)');
    return;
  }

  const rows = made
    .map((entry) => {
      // The Freesound sound number, taken from the page it is pinned to — not
      // `entry.id`, which is this project's own name for the slot it fills.
      const sound = entry.page?.match(/\/s\/(\d+)/)?.[1];

      const where =
        entry.source === 'pixabay'
          ? `[Pixabay](${entry.page}) — Pixabay Content License`
          : `[Freesound #${sound ?? '?'}](${entry.page}) by ${entry.author} — CC0`;

      return `| \`${entry.file}\` | ${entry.what} | ${where} |`;
    })
    .join('\n');

  await writeFile(
    path,
    [
      '# Audio credits',
      '',
      'Generated by `tools/audio/fetch.mjs`. Do not edit by hand — edit',
      '`tools/audio/sources.json` and re-run `node tools/audio/fetch.mjs sync`.',
      '',
      'Every file here is either **Pixabay Content License** (free for commercial use,',
      'no attribution required) or **CC0** (a public-domain dedication). Attribution is',
      'given anyway: the people who recorded these deserve it, and a list of where',
      'things came from is the only durable proof that they were free to take.',
      '',
      '| File | What it is | Source |',
      '| --- | --- | --- |',
      rows,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\nCREDITS.md rewritten (${made.length} files).`);
}

/* --- the command line ---------------------------------------------------- */

const [command, ...rest] = process.argv.slice(2);

if (command === 'search' && rest[0] === 'pixabay') {
  for (const hit of await searchPixabay(rest.slice(1).join(' '))) {
    console.log(`${hit.url}\n  ${hit.slug}`);
  }
} else if (command === 'search' && rest[0] === 'freesound') {
  const args = rest.slice(1);
  const max = Number(args.find((a) => a.startsWith('--max='))?.slice(6) ?? '1e9');
  const min = Number(args.find((a) => a.startsWith('--min='))?.slice(6) ?? '0');
  const query = args.filter((a) => !a.startsWith('--')).join(' ');

  for (const hit of await searchFreesound(query, { minDuration: min, maxDuration: max })) {
    console.log(
      `${hit.id.padStart(7)}  ${String(hit.duration).padStart(6)}s  ` +
        `${String(hit.downloads).padStart(7)}dl  ${hit.title}  — ${hit.author}`,
    );
    console.log(`         ${hit.url}`);
  }
} else if (command === 'resolve') {
  console.log(JSON.stringify(await resolvePixabay(rest[0]), null, 2));
} else if (command === 'sync') {
  await sync(rest);
} else {
  console.log(
    [
      'usage:',
      '  node tools/audio/fetch.mjs sync [id|group ...]',
      '  node tools/audio/fetch.mjs search pixabay <query>',
      '  node tools/audio/fetch.mjs search freesound <query> [--min=0.2] [--max=3]',
      '  node tools/audio/fetch.mjs resolve <pixabay track url>',
    ].join('\n'),
  );
}
