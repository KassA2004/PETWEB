import { useSyncExternalStore } from 'react';
import { audio, CHANNELS } from '../../lib/audio';
import type { Channel } from '../../lib/audio';
import { cn } from '../../lib/utils';

/**
 * The volume controls.
 *
 * Deliberately per-channel rather than one slider. The mix has a hierarchy
 * (`lib/audio/AudioBus.ts` — `DEFAULT_LEVELS`) and the reason people reach for
 * a volume control is almost never "all of it": it is "the music", or "the
 * bouncing", or "not while I am on a call". A single master slider makes them
 * choose between the room and silence.
 *
 * It lives in the Room tab because ambience and music are the room, but the
 * values are stored per device rather than on the account — see the note on
 * `Audio.persist`.
 */

const LABELS: Record<Channel | 'master', string> = {
  master: 'Everything',
  music: 'Music',
  environment: 'Outside',
  pet: 'Creature',
  sfx: 'Objects',
  ui: 'Interface',
};

/**
 * Subscribes to the audio singleton.
 *
 * `useSyncExternalStore` rather than an effect and a copy in state: the mixer
 * is not React's, several components could read it, and this is precisely the
 * hook for a value that lives outside the tree.
 */
function useAudioSnapshot(): number {
  return useSyncExternalStore(
    (listener) => audio.subscribe(listener),
    () =>
      // A cheap scalar that changes whenever anything the controls display
      // does. Returning an object here would allocate on every render and make
      // the store think it had changed every time.
      (audio.muted ? 1 : 0) +
      (audio.musicEnabled ? 2 : 0) +
      CHANNELS.reduce((total, channel, index) => total + audio.getLevel(channel) * (index + 3), 0) +
      audio.getLevel('master') * 11,
  );
}

export function SoundControls({ className }: { className?: string }) {
  useAudioSnapshot();

  return (
    <div className={cn('flex w-full flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
          Sound
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => audio.setMusicEnabled(!audio.musicEnabled)}
            aria-pressed={audio.musicEnabled}
            className={cn(
              'press rounded-full px-2.5 py-1 text-[0.65rem] font-medium outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              audio.musicEnabled
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Music
          </button>
          <button
            type="button"
            onClick={() => audio.setMuted(!audio.muted)}
            aria-pressed={audio.muted}
            className={cn(
              'press rounded-full px-2.5 py-1 text-[0.65rem] font-medium outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              audio.muted
                ? 'bg-destructive text-destructive-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {audio.muted ? 'Muted' : 'Mute'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {(['master', ...CHANNELS] as const).map((channel) => (
          <Row key={channel} channel={channel} />
        ))}
      </div>

      {!audio.ready && (
        <p className="text-[0.65rem] text-muted-foreground">
          Sound starts after your first click — browsers insist on it.
        </p>
      )}
    </div>
  );
}

function Row({ channel }: { channel: Channel | 'master' }) {
  const value = audio.getLevel(channel);

  return (
    <>
      <label
        htmlFor={`volume-${channel}`}
        className={cn(
          'text-xs',
          channel === 'master' ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {LABELS[channel]}
      </label>
      <input
        id={`volume-${channel}`}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        // `input`, not `change`: dragging a slider should be audible while it
        // is being dragged, which is the only way to set a level by ear.
        onChange={(event) => audio.setLevel(channel, Number(event.target.value))}
        onPointerDown={() => void audio.unlock()}
        className="h-5"
        aria-valuetext={`${Math.round(value * 100)} percent`}
      />
    </>
  );
}
