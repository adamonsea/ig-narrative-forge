# Explainer avatar and voice setup

Add a HeyGen stock presenter with a designed British voice to the existing explainer film, delivered as eight short clips — one per scene — so the player can show the right clip against the right beat.

## Step 0 — reconnect HeyGen (you)

HeyGen currently returns 401, so nothing can be created there yet. Reconnect the HeyGen integration in Lovable settings, then I can run the rest.

## How the avatar and voice get made

1. **Pick the presenter.** List HeyGen's public avatar looks, shortlist three that read as calm, editorial and British-plausible, and show you previews. You pick one; that look ID is fixed for all eight clips. Stock avatars need no consent flow.
2. **Design the voice.** Use HeyGen's voice designer with a prompt along the lines of "calm, dry, British editorial narrator, unhurried, warm but understated", filtered to `en-GB`. It returns up to three candidates; I synthesise the same test line ("Local stories are out there.") on each so you can compare like for like, and you pick one. That voice ID is then fixed too.
3. **Render eight clips.** One HeyGen video per scene, each speaking exactly the narration line already in `timeline.ts`, same avatar and voice throughout, transparent or dark background to sit on the navy stage.
4. **Host and wire.** Upload the eight MP4s as Lovable assets and reference them from the timeline.

## What changes in the app

- `timeline.ts` gains an optional `avatarClip` field per scene, holding the clip URL.
- `ExplainerPlayer` swaps its single `avatarSrc` prop for per-scene playback: the corner video changes source as the scene changes, restarts from zero, and hides when a scene has no clip.
- Scene durations get nudged to match each clip's real length once rendered, so the narration never gets cut mid-sentence.
- Muted state already exists; when muted the captions carry the film, and the avatar plays silently rather than disappearing.
- Nothing else changes — scenes, sound cues, haptics and both placements stay as they are.

## Cost and re-render note

Each copy change to a narration line means re-rendering that one clip only, which is why per-scene is the right split. Voice and avatar IDs are stored in one config constant so a later switch is a one-line change.

## Technical section

- New `src/components/explainer/avatar.ts` holding `AVATAR_LOOK_ID`, `VOICE_ID` and the scene-to-clip URL map, so the film has one place to configure presenter identity.
- Clips created via HeyGen `create_video_from_avatar` (one call per scene, `script` = the scene caption, `voiceId` = the designed voice), polled to completion, then downloaded and uploaded through `lovable-assets` so the app never depends on HeyGen's expiring URLs.
- `ExplainerPlayer` gets a `key={scene.id}` on the `<video>` element to force a clean restart per scene, plus `onEnded` left unhandled so scene timing stays owned by the existing timer.
