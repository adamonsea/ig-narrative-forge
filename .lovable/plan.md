# Accurate buildings in story pictures

Yes, this is tunable — and today it is only half-wired.

## How it works now

Each feed keeps a list of local place names (Settings → Keywords & Places). When a picture is made, those names are used to spot which place a story is about, and the wording then says: "render Towner Art Gallery from your own knowledge of it." That last step is guesswork by the picture model, which is why buildings come out generically right but architecturally wrong.

## The change

Let you write, per place, a short description of what the building actually looks like — and send those words into the picture wording instead of relying on the model's memory.

1. **Place descriptions.** Next to each place name in feed settings, an optional "What it looks like" box: e.g. *Towner Art Gallery — large modernist block, flat roof, broad bands of colour across a white facade, tall square windows, set back from the seafront.* Auto-saves like the rest of the settings.
2. **A "suggest description" button** per place, so you can get a first draft and then correct it rather than typing from scratch.
3. **Picture wording uses your words.** When a story mentions that place, the description you wrote is dropped into the prompt verbatim as the required architecture, with the instruction to keep its proportions and unmistakable features while staying in the house print style. Places with no description behave exactly as they do today.
4. **Restraint rule kept.** The description is capped in length and framed as "big shapes that make it recognisable", so it adds accuracy without reintroducing fussy detail.

## Technical notes

- Migration: `topics.landmark_descriptions jsonb default '{}'::jsonb`, keyed by landmark name; grants unchanged (existing topic policies cover it).
- `KeywordManager.tsx`: description input per landmark, saved through the existing topic update path; suggestion button calls the existing regional-suggestion edge function with a new `describe` mode.
- `_shared/prompt-helpers.ts`: `extractLocationDetails` gains a `landmarkDescriptions` map — when the matched name has one, it returns that text instead of asking the small model to invent features. `buildIllustrativePrompt` / `buildPhotographicPrompt` mark the LOCATION ACCURACY block as author-supplied and authoritative.
- `story-illustrator`, `auto-illustrate-stories`, `enhanced-content-generator` and `image-model-bench` select and pass the new column.
- Fail-open throughout: missing column, empty map or missing key falls back to current behaviour.

## Trying it

After the change: write a description for Towner Art Gallery, then regenerate a cover on a Towner story and compare against the existing one.
