# Reference photos for places

Right now each place in a feed's settings can have a written description ("What it looks like"), and that text is passed to the picture maker as the required architecture. This adds actual photographs to the same place entry, so the picture maker can see the building as well as read about it.

## What you'll be able to do

In Settings → Keywords & Places, each place gets a small row of reference photos underneath its description box:

- **Find photos** — one button looks the place up online and shows a handful of candidate photographs; you tick the ones that look right and they're saved to the place.
- **Upload** — add your own photographs from your computer.
- **Paste a link** — add a photo from a web address.
- Each saved photo shows as a thumbnail with a remove button. Up to three photos per place.

"Suggest description" then *looks at* the saved photos rather than working from memory, so the written description matches the real building.

When a story mentions that place, its photos are attached to the picture request alongside the two house-style covers, with clear instruction: take the *look and finish* from the style covers, take the *building's shape, proportions and detail* from the photographs. Never copy a photograph literally.

Places with no photos behave exactly as they do today.

## Where the photos come from

Online lookup uses Wikimedia Commons, which is free, needs no account, and is strong on named buildings and landmarks. Results are shown as candidates for you to approve — nothing is saved automatically. If the lookup finds nothing, the upload and paste-a-link options still work.

## Technical notes

- Migration: `topics.landmark_reference_images jsonb default '{}'::jsonb`, mapping place name to an array of `{ url, credit }`. Cap three per place, enforced in the UI and ignored beyond three when reading.
- Storage: uploaded and imported photos are copied into the existing public `visuals` bucket under a `landmark-refs/<topic_id>/` prefix, so the picture maker fetches a stable URL we control rather than a third-party host that may block server fetches.
- New edge function `landmark-photo-search`: takes a place name plus region, queries the Wikimedia Commons API, returns up to 8 candidates (thumbnail, full URL, attribution). Fail-open — an empty list on any error.
- New edge function path in `suggest-regional-elements`: `mode: 'describe'` gains an optional `imageUrls` array. When present, the description call becomes a multimodal request (`image_url` content blocks) so the model describes the actual photographs; with no photos, current behaviour is unchanged.
- `supabase/functions/_shared/style-references.ts`: add `loadReferenceImagesFromUrls(urls)` reusing the existing fail-open fetch loop, and a `SUBJECT_REFERENCE_NOTE` explaining the split between style references and subject photographs.
- `story-illustrator` and `image-model-bench`: after resolving which landmarks a story is about (existing `extractLocationDetails` path), load that place's saved photos, append them to the `image[]` parts after the style references, and append `SUBJECT_REFERENCE_NOTE` to the prompt. Total attachments capped at 4 (2 style + 2 subject). Any failure to load a photo skips it and falls through to today's behaviour.
- `KeywordManager.tsx`: per-place photo strip, candidate picker dialog, upload input, paste-link input; saves through the existing `topics` update path with auto-save, no success toasts (failures only).
- The onboarding copy of the places editor (`FeedSetupGuide.tsx`) keeps the description box only — photos stay a settings-level refinement.

## Verification

Add two photos to the Towner in Eastbourne settings, re-suggest its description, then generate a cover on a Towner story and compare with the current one.
