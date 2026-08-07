---
name: explainer-film-pipeline
description: Build a branded explainer/intro film in a React app — timed scene timeline, HeyGen avatar narration clips, in-app player, and an offline Playwright+ffmpeg render to a high-resolution MP4. Use when asked for an explainer video, intro film, animated product tour, or a downloadable marketing video from app code.
---

# Explainer film pipeline

A film is **code, not a video file**: React scenes on a fixed 16:9 stage, a timeline of beats, per-beat presenter clips, and an offline renderer that captures the running app and composites the presenter back in. Everything is re-renderable after a copy change.

## Architecture (copy this shape)

```text
src/components/<film>/
  timeline.ts     # SceneDef[]: id, duration, caption, Component  (single source of truth)
  scenes.tsx      # one component per beat, viewport-relative units only
  avatar.ts       # sceneId -> hosted presenter clip URL + voice/avatar ids
  Player.tsx      # drives the timeline, renders scene + caption + presenter bubble
  ResolutionBar.tsx
src/pages/FilmExport.tsx   # chrome-free render stage at /film-export
scripts/render_film.py     # Playwright capture + ffmpeg compose
```

See `references/pipeline.md` for the build order and `references/rendering.md` for the renderer details. `scripts/render_explainer.py` is a working reference implementation — copy and adapt.

## Hard-won rules

1. **Timeline owns timing.** Scene duration is measured from the rendered narration clip, not guessed. Add a `TAIL_PAD_MS` (~600ms) to every beat — decode/start latency clips the last syllable otherwise. Export a `sceneDuration()` helper and use it everywhere so the player and renderer never disagree.
2. **One narration clip per scene, not one long clip.** A copy tweak then re-renders one clip, not the whole film. Store clip URLs in one map keyed by scene id; a missing entry must degrade to caption-only, so the film works before any clip exists.
3. **Captions are the narration, verbatim.** Same string feeds the HeyGen script and the on-screen caption. Muted playback then loses nothing.
4. **Scenes use viewport-relative units** (`vw`/`vh`/`clamp`), never fixed px, so one scene set serves the in-page player, mobile, and a 4K render.
5. **Dedicated export route** (`/film-export`), noindex, no nav/chrome, that publishes `window.__filmTiming = { totalMs, scenes: [{id, durationMs}] }`. The renderer reads that instead of hardcoding anything.
6. **Capture in real time, not virtual time.** Looping CSS/Framer animations starve Chromium's virtual-time budget and stall. Screencast at normal speed and keep each frame's CDP timestamp, then resample to CFR with an ffmpeg concat list of per-frame durations.
7. **Presenter is composited in ffmpeg, not captured.** Build a per-beat presenter track (pad with `tpad`/`apad`, trim to beat length, concat), then overlay it as a circular bubble via `geq` alpha mask and take audio from that track. Graphics render natively at any resolution; the avatar clip is the only upsampled element.
8. **Avatar/voice ids live in one config constant.** Pick a stock avatar look (no consent flow) and design the voice once with a locale filter; synthesise the same test line across candidates to compare like for like.
9. **Cost discipline.** Narration re-renders are per-scene and metered; never regenerate all clips for a one-word change.

## Branding a new film

Keep the pipeline identical; swap only: scene components + palette tokens, narration copy in `timeline.ts`, avatar look + voice id in `avatar.ts`, and the bubble size/margin constants in the render script. Never fork the renderer per project.

## Anti-patterns

- Hardcoding scene durations in both the player and the render script.
- Capturing the presenter as part of the page (it desyncs and can't be re-cut).
- `full_page` screenshots or per-frame `page.screenshot()` — far too slow; use CDP screencast.
- Fixed-pixel scene layouts.
- One monolithic narration audio track.