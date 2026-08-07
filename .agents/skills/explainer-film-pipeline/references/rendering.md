# Offline high-resolution render

`scripts/render_explainer.py` in this skill's `scripts/` is a working implementation. Flow:

1. **Launch** headless Chromium at a 1920x1080 viewport with `device_scale_factor = target/1080` (1.0 / 1.333 / 2.0 for 1080p / 1440p / 4K). Flags: `--force-color-profile=srgb --font-render-hinting=none --disable-frame-rate-limit --hide-scrollbars`.
2. **Read timing** from `window.__filmTiming` (wait for it, don't sleep blindly). Total = `totalMs + END_HOLD_MS`.
3. **Capture** via CDP `Page.startScreencast` (`format: png`, `everyNthFrame: 1`), ack every frame, and reload the page immediately before starting so capture begins on beat one. Save each frame with its `metadata.timestamp`.
4. **Resample** to CFR: write an ffmpeg concat list with `file`/`duration` pairs derived from consecutive timestamps (floor at 1/240s), repeat the last file, then encode with `-fps_mode cfr -r FPS`.
5. **Presenter track**: per beat, `tpad=stop_mode=clone:stop_duration=30` + `apad`, `-t <beat seconds>` to lock length; silent black filler for beats with no clip. Concat with `-c copy`.
6. **Compose**: scale/crop the presenter to a square, `geq` alpha circle mask, `overlay=W-w-M:H-h-M`, map audio from the presenter track. `-crf 16 -preset medium -pix_fmt yuv420p -movflags +faststart`.

## Gotchas

- Virtual time (`Emulation.setVirtualTimePolicy`) stalls on infinite loops — capture in real time.
- Bubble size and margin must scale with `args.scale` or the overlay drifts at 4K.
- Graphics are genuinely native-resolution; the avatar clip is provider-capped (usually 1080p) and upsampled — say so rather than claiming true 4K throughout.
- Write output to a mounted documents dir so the user can download it.
- Requires the dev server running and `ffmpeg` on PATH.