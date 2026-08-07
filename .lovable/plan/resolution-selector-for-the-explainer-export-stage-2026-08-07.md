# Resolution selector for the explainer export stage

## What you'll get

On `/explainer-export` (the hidden render stage), a small control bar appears in the corner with a resolution choice:

- 1080p — 1920x1080
- 1440p — 2560x1440
- 4K — 3840x2160

Picking one does two things:
1. Sets the stage to render at that resolution (URL becomes `?res=2160`, so the choice is shareable/repeatable).
2. Shows the exact one-line render command for that choice with a copy button, e.g. `python3 scripts/render_explainer.py --scale 2`.

The bar is hidden automatically during capture (adding `&chrome=0`, which the render script already passes), so it never appears in the finished video.

## Can we really do 4K?

Yes, with one honest caveat.

- The scene graphics, captions, logo and typography are React/CSS, drawn as vectors. They are rendered natively at whatever device scale factor we pass, so at 4K they are genuinely 4K-sharp — not upscaled.
- The presenter bubble is different: those are the HeyGen avatar clips, which are 1080p-class source video. In a 4K master the bubble is only ~220px wide at 1080p scale, so it is scaled up roughly 2x within a small circle. In practice it holds up fine at that size, but it is upscaled, not true 4K detail.

So a 4K export is real 4K for everything the browser draws, and a modestly upsampled presenter inset. Render time and disk use scale roughly 4x versus 1080p (the capture writes lossless PNG frames before encoding), so expect a noticeably longer run.

If you later want a fully native 4K presenter, that needs a 4K source render of the avatar clips from HeyGen, not a change here.

## Technical notes

- `src/pages/ExplainerExport.tsx`: read `res` and `chrome` from the query string, expose the chosen width/height on `window.__explainerTiming` (so the script can self-configure), and render a small `ResolutionBar` component when `chrome !== "0"`.
- New `src/components/explainer/ResolutionBar.tsx`: three preset buttons plus the generated command string and copy-to-clipboard. Uses existing design tokens, no hardcoded colours.
- `scripts/render_explainer.py`: keep `--scale` as the primary switch, add `--res 1080|1440|2160` as a friendlier alias that maps to the device scale factor (1, 1.333, 2) and appends `?res=<n>&chrome=0` to the stage URL. Output filename already includes the height, so 4K writes `curatr-explainer-2160p.mp4`.
- No changes to the timeline, scenes, or the public homepage player.
