# Curatr explainer film — scenes, script and player

A short, self-running explainer (~75 seconds, 8 scenes) that shows what Curatr does, built as an in-app animated player rather than a pre-rendered file. It plays from the home page hero and as the final beat of the waitlist questionnaire, and it leaves a slot for a HeyGen avatar to be dropped in later without redoing the scenes.

## Why an in-app player, not an MP4

- Scenes are real Curatr UI, stylised — feed cards, slides, the pipeline — so it always matches the product.
- Motion, haptics (`navigator.vibrate` on mobile beats) and short UI sounds are only possible in-app.
- Copy and pricing can be edited later without a re-render.
- A HeyGen avatar clip can be layered in as a small corner video on the same timeline, or the whole thing screen-captured to MP4 later if a file is needed for social.

## Script and scenes

Voice: calm, dry, British editorial. Each scene is one line of narration plus one visual idea. Timings are target beat lengths; total ≈ 75s.

**1 — The problem (0:00–0:08)**
"Local stories are out there. Finding them, writing them, and making them look good is the hard bit."
Visual: a drift of grey headline fragments floating in from all sides, overlapping, unreadable.
Sound: soft paper rustle. Haptic: none.

**2 — Pick a subject (0:08–0:17)**
"Start with a place, or a subject. A town. A beat. A cause."
Visual: fragments sweep away; a single input fills itself — "Eastbourne" — typed at reading speed, then a green chip snaps in.
Sound: type ticks and one confirm tone. Haptic: light tick on the snap.

**3 — Sources gather themselves (0:17–0:27)**
"Curatr trawls your sources for you — every day, in the background."
Visual: five source pills fan out around the subject, thin lines pulse inward, a live counter rolls from 0 to 47 articles.
Sound: soft pulses in time with the lines.

**4 — The filter (0:27–0:36)**
"It keeps what's genuinely local and relevant. The rest never reaches you."
Visual: cards fall through a sieve — most fade, four land bright and stacked.
Sound: two dull thuds. Haptic: one medium tap when the four land.

**5 — Written and illustrated (0:36–0:48)**
"What's left is rewritten into clean, readable stories — and illustrated automatically."
Visual: one card opens; headline and three slide paragraphs typewrite in; a flat editorial illustration paints in behind them.
Sound: a single soft chime as the image resolves.

**6 — Publish anywhere (0:48–0:58)**
"Then it publishes itself. Your own feed, your newsletter, a widget on your site, social carousels."
Visual: the story card duplicates and flies into four labelled destinations arranged around it, each landing with a small bounce.
Sound: four light landings. Haptic: light tap per landing.

**7 — You stay the editor (0:58–1:07)**
"You stay in charge — approve, edit, or spike anything, in seconds."
Visual: a thumb taps approve on one card and swipes another away; the feed reflows.
Sound: swipe whoosh. Haptic: tap on approve.

**8 — Close (1:07–1:15)**
"Run one feed, or run ten. Curatr does the trawling — you keep the voice."
Visual: three feeds tile into a grid, then the wordmark resolves with a single primary button.
Sound: last chime, then silence.

CTA differs by placement: home page shows "See a live feed" and "Join the waitlist"; end of questionnaire shows "See a live feed" only, since they have just joined.

## Placements

- **Home page**: a "Watch the 75-second tour" control near the hero, opening the player in a full-screen overlay (same overlay pattern as the existing demo).
- **Questionnaire**: on the thank-you step, offered as "While you wait — here's what you've signed up for", playing inline in the same panel.

## Technical section

- New `src/components/explainer/` — an `ExplainerPlayer` driving a timeline of scene components (`SceneProblem`, `SceneSubject`, … `SceneClose`), each a framer-motion composition using existing design tokens and the dark hero palette (navy `hsl(214,50%,9%)`, accent green `hsl(155,100%,67%)`).
- Timeline is a plain array of `{ id, duration, Component }` advanced by a single timer, so scenes stay independent and re-orderable. Controls: play/pause, scene dots, skip, mute.
- Sound: 5–6 short WebAudio-synthesised cues (no audio files to host); muted by default with an obvious unmute, so autoplay policies never block playback.
- Haptics: `navigator.vibrate` behind feature detection, 8–15ms taps only, skipped under reduced-motion.
- `useReducedMotion` respected throughout — scenes cross-fade instead of animating, and durations shorten.
- Captions rendered per scene so the film works with sound off and stays accessible; the narration lines are the caption source.
- Avatar slot: an optional corner `<video>` layer in `ExplainerPlayer` taking one HeyGen MP4 URL plus start offsets. With no URL configured the player runs caption-only — nothing else changes.
- Shared overlay component reused in both placements; no changes to feed, pipeline or backend code.