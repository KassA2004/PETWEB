# Architecture and layers

## Frontend code-split boundaries

Added during the performance optimization pass
(`Docs/plans/website-performance-optimization-plan.md`, Tasks 4-6). The entry
bundle used to ship the whole application — auth forms, the dashboard, PixiJS,
the physics engine, every customization catalog — in one 820 kB chunk,
regardless of whether a visitor was signed in or what they actually opened.

Four `lazy()` boundaries exist now:

| Boundary | File | Loads when |
|---|---|---|
| Auth screen | `src/features/auth/AuthScreen.tsx` | The visitor has no session (`AuthGate`) |
| Dashboard | `src/features/dashboard/Dashboard.tsx` | The visitor has a session (`AuthGate`) |
| Customizer | `src/features/customization/CustomizerPanel.tsx` | The Pet tab is opened |
| Memories | `src/features/memories/MemoriesPanel.tsx` | The Memories tab is opened |

`AuthGate` (`src/features/auth/AuthGate.tsx`) is the single decision point
between the two top-level branches — it renders one lazy component or the
other inside a `Suspense`, never both. `Dashboard.tsx` owns the two
tab-scoped boundaries; `PetHabitat`, `GoalsPanel`, and `RoomStylePanel` stay
eager because they are on the load path (the room itself, and the default
tab) and lazy-loading them would slow the common case rather than help it.

The Customizer's `Suspense` fallback is a `CustomizerSkeleton`
(`src/features/customization/CustomizerSkeleton.tsx`) shaped like the Body
tab it opens on, imported statically so it is present before the lazy chunk
ever arrives. Other fallbacks stay quiet text where no skeleton was
warranted.

## Background prefetch (perceived-performance pass)

Added by `plans/perceived-performance-and-loading-plan.md` (Phase D). **The
code-split boundaries above are unchanged** — a signed-out visitor still never
downloads the customizer. What changed is *when* a signed-in visitor's browser
fetches the two tab-scoped chunks: instead of waiting for the click, they are
fetched in the background once the room has finished its first draw.

`PetHabitat` reports readiness once, via an `onReady` callback fired at the
end of its mount effect, after the scene is on the stage and the saved
arrangement is placed (`src/features/habitat/PetHabitat.tsx`). `Dashboard`
uses that signal to call `prefetchPanels` (`src/features/dashboard/prefetch.ts`),
which — during an idle callback, and only then —

1. `import()`s `CustomizerPanel` and `MemoriesPanel` using the exact same
   specifiers as their `lazy()` calls above, so the bundler's module registry
   resolves the later real import from cache instead of fetching twice, and
2. once both chunks have resolved, prewarms the Body tab's option-preview
   cache (`prewarmFirstCategory`, only the first grid of the first tab — not
   the whole catalog) so that opening the Pet tab finds most of its tiles
   already rendered.

This is sequential, never parallel — the two chunk imports and the prewarm
share a main thread with a running PixiJS scene, and firing them all at once
would drop frames in the room the user is actually looking at. It is also
cancellable: sign-out or adopting a different saved creature (which re-freezes
the preview base — see `previews render against a frozen base` in
`Docs/AGENTS.md`) tears down and, where relevant, restarts the prefetch.
