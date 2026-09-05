# AUDIO & FEEDBACK

**Purpose:** how the product makes noise, and how an interaction acknowledges
itself. Read this before adding a sound anywhere, before adding an animation to
a control, and before touching `lib/audio/`.

It sits alongside, not instead of:

| Doc | Covers |
|---|---|
| `theme-and-design.md` | how things should *look* |
| `animation-approach.md` | how the *creature* should move |
| `room-and-objects.md` | the room, the grid, the objects |
| this | how things *sound*, and how the interface answers back |

---

## 1. The one rule

> **No component makes a sound. It reports that something happened.**

A button calls `sfx.click()`. A physics collision calls `emitSound('prop-bump', …)`.
Neither knows what that is made of, how loud it is against everything else, or
whether the browser has let the audio start yet. All three are decisions that
have to be made once, for everything, or there is no mix — only a page full of
unrelated noises.

```text
  the room  ──→ RoomSound ──┐
                            ├──→  lib/audio  ──→ AudioBus ──→ out
  the UI    ──→ sfx.*() ────┘      (voices, ambience, music)
```

`scenes/room/RoomSound.ts` is data: a kind, a strength, a pan and a distance.
The scene has no `AudioContext` and never will — which is also why
`room-preview.html` can render the world silently in a background tab.

---

## 2. Recordings for the world, synthesis for the interface

Everything used to be synthesised (`lib/audio/voices.ts`) from three
ingredients: an oscillator with a falling pitch, a burst of filtered noise, and
an envelope. The argument was the one `AGENTS.md` makes for artwork — an asset
you cannot tune stays slightly wrong for ever — and for part of the product it
is still right.

It was not right for the part the ear has heard before. Filtered noise is
convincing *wind*, because air moving past things genuinely is broadband noise
with a wandering filter on it and there is no further detail to miss. It is not
a convincing sea: a sea is thousands of individual collapses with a shape to
each, and a band of noise breathing every eight seconds is a *description* of
one. The same holds for a creature (a two-note sine is a beep), for material (a
rubber ball has a timbre; "impact" does not), and most of all for the music,
where a random pentatonic picker is — after twenty minutes — audibly a random
pentatonic picker.

So the split is:

```text
  recorded    the creature, impacts, the six ambience beds, the music, the
              clock, the light switch, the fanfare
  synthesised every interface sound (click, open, close, grab, drop, hover,
              hush, restore, refuse, place, lift) — and a fallback for every
              one of the recorded ones
```

**The synthesised voice is never deleted.** It is what plays before a file has
downloaded, when a file 404s, and when a browser will not decode one. Nothing in
the product waits for audio: `Samples.take` answers immediately with a buffer or
with null, and the caller has an oscillator either way. So the first chirp after
the first click may be synthesised and the second one a real animal, and nobody
sees a loading state for a sound.

**Files are never added by hand.** They are pinned in `tools/audio/sources.json`
— Pixabay Content Licence for music, CC0 and nothing else from Freesound — and
fetched, trimmed, level-matched and credited by `tools/audio/fetch.mjs`. That is
what keeps the licence claim true and the levels reproducible; see §3.

**Strength changes brightness, not only level.** A hard knock is not a loud
version of a soft one — it has more high end. A mixer that only scales gain
makes every event sound like the same event at a different distance, which is
precisely what a room full of physics must not sound like. A *recording* has the
brightness the microphone heard and cannot be given more of it without sounding
filtered, so for those, strength moves level (across a range with a floor, so a
light touch is still audible) and the variation comes from two takes and a few
per cent of playback rate instead.

---

## 3. The mix

Five channels under a master, into a limiter. Levels live in one table
(`AudioBus.DEFAULT_LEVELS`) and nowhere else.

```text
  MUSIC        0.16   the floor of the room, never an event
  ENVIRONMENT  0.30   clearly there, never asking for attention
  PET          0.50   the creature is the thing you are looking at
  SFX          0.36   objects: the loudest single hits, and the most frequent
  UI           0.55   short, and the only channel allowed a real event
  ─────────────────
  MASTER       0.75 → DynamicsCompressor (ratio 12, −6 dB) → destination
```

Measured, not chosen. At the defaults, with a tap on each channel:

| | peak | note |
|---|---|---|
| music | 0.020 (RMS 0.008) | lowest thing in the product |
| ambience | 0.062–0.075 (RMS 0.016–0.020) | **all six views level-matched** |
| ball bounce | ~0.10 | throttled to ≥90 ms |
| plant thud | 0.069 | |
| pet chirp | 0.048 | |
| goal completed | 0.059 | ~1.6× a click, and 450 ms long |
| UI click | 0.037 | 60 ms |

Two of those numbers were wrong when written by ear, and both were only
findable by measuring:

**The ambience beds were not level-matched.** Low-frequency material carries far
more energy for the same apparent loudness, so the sea and the city came out at
three times the RMS of the meadow. Changing the window was a change in *volume*
rather than in place. The gains in `ambience.ts` are now set so every view lands
near 0.018 RMS. Retuning one means measuring it against the others.

**The ball was the loudest thing in the room.** A single throw sounded great; a
game of fetch was exhausting. A sound that *repeats* has to sit below the sounds
that do not.

### The recordings are matched to the table, not the other way round

Thirty files recorded by thirty people arrive thirty different distances from
the microphone, and a table like the one above means nothing against that. So
nothing is used as downloaded. `tools/audio/fetch.mjs` measures and corrects
every file on the way in:

```text
  one-shots   peak-normalised to a stated dBFS per sound (sources.json's
              `peakDb`), then trimmed of head and tail silence and given a 4 ms
              fade in and a ~25 ms fade out. Peak rather than loudness because
              R128's integration window is longer than most of these are
  beds        integrated loudness (EBU R128) to −30/−31 LUFS, which is where the
              synthesised beds already sat. An upgrade mid-crossfade is then a
              change of material and not of level
  tracks      the same, to −21 LUFS
```

The correction is a measured constant gain plus a limiter, never `loudnorm`'s
dynamic mode: dynamic normalisation on a quiet ambience bed audibly pumps the
noise floor, which is the one artefact a bed cannot have.

This is also why the channel table did **not** move when the recordings landed.
The recordings were fitted to it. Measured at the master bus, through an
`AnalyserNode`, with the beds and the music silenced — recorded against
synthesised, both at strength 0.8, distance 0.2:

| one-shot | synthesised | recorded |
|---|---|---|
| ball bounce | 0.042 | 0.046 |
| knock | 0.044 | 0.044 |
| soft thud | 0.044 | 0.046 |
| creature, happy | 0.033 | 0.039 |
| clock chime | 0.028 | 0.025 |
| light switch | 0.017 | 0.016 |
| goal completed | 0.045 | 0.045 |

The creature is the one deliberately over parity, by about a fifth: it is the
thing the user is looking at, and a real voice earns a little more room than the
beep it replaces. Everything else is within measurement error of the sound it
took over from.

### The beds are matched in LUFS, not in RMS — and that is a change

The old synthesised beds were matched on **unweighted RMS**, because the failure
being fixed was that low-frequency material (the sea, the city) carried three
times the energy of the meadow for the same apparent loudness. Equal RMS was the
crude fix for that.

The recordings are matched on **K-weighted loudness** instead, which is the
thing R128 exists to model: it discounts the low end roughly the way hearing
does. So they are *deliberately* not equal in RMS. At the master, over five
seconds:

```text
  park 0.0055   mountains 0.0051   ocean 0.0041   city 0.0039
  dungeon 0.0026   meadow 0.0022
```

A two-and-a-half-fold spread, and it is the right spread — the meadow is almost
entirely birds and crickets, which are loud to the ear at a fraction of the
energy. The two quiet ones were nudged up 3 dB from strict loudness parity
anyway (`sources.json`: meadow −27, dungeon −28 LUFS against −30/−31 for the
rest), because R128 gates out quiet passages and a cave that is mostly silence
between drips ends up matched on its drips alone.

### Focus sessions, measured against a click

Rendered through the same chain offline (channel gain → master → compressor) and
quoted as ratios, because a ratio is what survives a change of measuring rig:

| voice | level | why there |
|---|---|---|
| `hover` | 0.37× click | fires while the hand is still moving; anything with a body to it turns a hover into a stutter |
| `grab` | 0.80× click | a line of text coming off a list |
| `drop` | 1.12× click | the gesture resolving. Slightly above a grab, because something happened |
| `restore` | 2.78× click | the lights coming back on: the time was served |
| `hush` | 2.93× click | the room going quiet. 340 ms, the longest thing on the UI channel |
| `fanfare` | 7.90× click | **finishing the goal itself** |

The gap between `restore` and `fanfare` is the point, not an accident. Finishing
a session means "I did the time"; finishing a goal means "I am done", and the
product says so in sound before it says so in words
(`API-endpoints/12-focus-endpoints.md` §1). Nearly a factor of three separates
them.

On the other two channels, against their own neighbours:

| voice | level | |
|---|---|---|
| `lightSwitch` | 0.28× a chime | a switch is furniture being touched, not a button |
| `chirp` `sleepy` | 0.77× the idle chirp | giving up on the day |
| `chirp` `glum` | 0.80× the idle chirp | would rather you had not left again |
| `chirp` `happy` | 1.89× the idle chirp | for contrast — the loud end of the creature |

The two new creature moods are the **quietest** in the table on purpose. A sulk
that is loud is not a sulk, it is a complaint.

---

## 4. Nothing is allowed to spam

Physics does not care that fourteen collisions in a third of a second is
unpleasant. Three things make sure it does not have to:

```text
1. the room filters by significance   AUDIBLE_IMPACT_SPEED (PetRoom.ts)
     a ball resting against a chair leg generates a stream of contacts that
     are physically real and acoustically nothing

2. the bus throttles by kind          take({ throttleKey, cooldownMs })
     sounds sharing a key share a cooldown. Two balls are the same key —
     the ear does not distinguish them, it only hears the count

3. the bus caps polyphony             MAX_VOICES = 12
     chosen against the worst honest case: a toy box knocked over
```

Measured: **14 collisions inside one millisecond produce 1 sound.** Six spread
100 ms apart produce 6, so a real bounce sequence still reads as a sequence.

A refused voice returns `null` rather than throwing or queueing. Refusal is the
normal case on a busy frame, so it has to be cheap and it has to be nothing.

---

## 5. Autoplay, and the trap inside it

Browsers will not start an `AudioContext` that no gesture asked for. One created
at page load starts `suspended` and stays that way, silently.

`audio.unlock()` is wired to the first real interaction — every `Button`
pointer-down, and the habitat canvas. It is **idempotent on purpose**:

```ts
async unlock() {
  await this.bus.unlock();
  if (!this.bus.ready) return;
  if (this.pendingView) this.ambience.set(this.pendingView);   // both are
  if (this.musicWanted) this.music.start();                    // no-ops if done
}
```

The tighter version — apply the pending ambience *only on the transition to
ready* — has a hole that cost real time to find: any press that unlocked the
context before the room had said which window it has consumed the transition,
and the ambience then never started at all. **The music did**, which made the
audio look like it was working.

> If the ambience is silent but the music is playing, the pending view was
> dropped. Check `unlock` before checking the beds.

---

## 6. Volume lives on the device

`localStorage`, not `RoomStyle`.

`RoomStyle` is what the room *is*, and it follows the account to every machine.
How loud it should be is a fact about the room the user is sitting in — turning
it down on a laptop at midnight must not silence the desktop tomorrow. Same
reasoning as the room's, opposite answer.

The controls are per-channel rather than one master slider, because the reason
people reach for a volume control is almost never "all of it": it is *the
music*, or *the bouncing*, or *not while I am on a call*.

---

## 7. Interface motion

Keyframes and the `.press` utility live in `src/index.css`. Durations are the
whole argument:

```text
  press        90 ms   inside the ~100 ms the hand still considers "now"
  modal in    180 ms   long enough to say where it came from
  modal out   140 ms   an entrance with an instant exit is worse than neither
  strike      340 ms   a goal crossing itself out
  celebrate   620 ms   the only thing on screen you are meant to look at
```

Rules:

- **Short, subtle, purposeful, interruptible, non-blocking.** No animation gates
  a state change behind its own completion. A dialog is logically closed while
  it is still visibly leaving.
- **Feedback must distinguish what happened.** A destructive button does not
  make the same noise as a confirming one. An animation that is identical
  whatever happened is decoration, not feedback.
- **`prefers-reduced-motion` turns all of it off.** Someone who has asked their
  operating system to stop moving things has asked this application too.

### The creature reacts to the page

`PetRoom.react(kind)`, where kind is one of six:

| | when | what it does |
|---|---|---|
| `notice` | a dialog opened | looks up, then gets on with its afternoon |
| `celebrate` | something good happened | a hop and a happy chirp |
| `startle` | something arrived at speed | |
| `settle` | the lights went out for an hour | a yawn. The *sleeping* is the brain's, caused by the darkness |
| `greet` | the hour is up | **scales with affection** — bounds over, comes to look, or just sits up |
| `sulk` | the hour was abandoned | sits, turns away from the cursor, over it in nine seconds |

`notice` is still the one used most, and all of them are deliberately small:
anything more and a modal-heavy session becomes a creature having a nervous
breakdown.

`greet` is the only one whose result is not fixed, and that is the whole of how
affection is *displayed* — the same event produces three different creatures
depending on how the last fortnight has gone. Nothing about it is a cutscene:
each outcome is one of the ordinary behaviours the brain already had.

---

## 8. Adding a sound

1. A kind in `RoomSoundKind` (`scenes/room/RoomSound.ts`) if the *room* makes
   it, or a method on `audio.ui` if the interface does.
2. A voice in `lib/audio/voices.ts`, with a throttle key and a cooldown.
3. One case in `Audio.room()`.
4. **Measure it** against §3 before deciding it is right.

If adding one needs a conditional anywhere else, the event is missing a field.

---

## 9. Checklist

- [ ] No component constructs audio; it reports an event.
- [ ] Every repeating sound has a throttle key and a cooldown.
- [ ] Levels came from a measurement, not from taste alone.
- [ ] The context is only started from a user gesture, and `unlock` is idempotent.
- [ ] Timers, listeners and audio nodes are cleaned up on unmount.
- [ ] Animations are under ~350 ms, non-blocking, and off under
      `prefers-reduced-motion`.
- [ ] `npx tsc -b` and `npx eslint src` are clean, from `frontend/`.
- [ ] It has been *listened to* — `/app-preview.html`, §10 of
      `room-and-objects.md`.
