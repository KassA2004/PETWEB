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

## 2. There are no audio files

Every sound is synthesised (`lib/audio/voices.ts`) from three ingredients: an
oscillator with a falling pitch, a burst of filtered noise, and an envelope.

This is the same argument `AGENTS.md` makes for artwork, and it holds for the
same reasons. An asset you cannot tune stays slightly wrong for ever; a bounce
that is a shade too bright is one number here rather than an afternoon in an
editor. Nothing is downloaded, nothing is licensed, and nothing has to be
committed as a binary.

**Strength changes brightness, not only level.** A hard knock is not a loud
version of a soft one — it has more high end. A mixer that only scales gain
makes every event sound like the same event at a different distance, which is
precisely what a room full of physics must not sound like.

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
