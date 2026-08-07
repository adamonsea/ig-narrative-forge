# Build order

1. **Script first.** Write 6-10 beats, one sentence each, ~5-8s spoken. Each beat = one idea + one visual. Put them straight into `timeline.ts` with placeholder durations.
2. **Scenes.** One component per beat, props `{ progress: number }` (0-1 within the beat) so animations can be driven deterministically. Viewport-relative sizing only. Palette from CSS tokens, not hex.
3. **Player.** Timer advances scenes using `sceneDuration(scene)`. Renders: scene, caption, presenter `<video>` with `key={scene.id}` (forces restart), and a mute control. A `renderMode` prop hides the in-page chrome for the export stage.
4. **Presenter clips.** For each scene call the avatar provider with `script = scene.caption`, same avatar look and voice throughout, dark or transparent background matched to the stage. Poll to completion, download, and re-host as project assets — provider URLs expire.
5. **Measure and lock durations.** `ffprobe` each clip; set `scene.duration` to the clip length. Add `TAIL_PAD_MS`.
6. **Export stage + render script.** See `rendering.md`.

## Voice and avatar selection

- Stock/public avatar looks need no consent flow; a private avatar does (consent URL expires in 24h).
- Design the voice from a descriptive prompt plus a locale filter (e.g. `en-GB`), take the 3 candidates, synthesise one identical test line on each, pick, then freeze the id in config.
- Re-render a clip only when its narration line changes.

## Delivery surfaces

The same film serves: an in-page hero player, a full-screen takeover overlay, an end-of-funnel autoplay, and a downloadable MP4. Only the wrapper differs — the player component is shared.