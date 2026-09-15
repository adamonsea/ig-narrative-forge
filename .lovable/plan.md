# Make the writing sound human

Three changes, working together: sharper instructions on the first draft, a short rewrite pass that strips the AI tells, and a house-style box per feed that also learns from stories you've already published.

## 1. Better first draft

The writer currently gets a tone label ("conversational") and a word limit, which is exactly the recipe for flat, samey copy. Add to its instructions:

- A banned-phrase list of the usual AI tells: "in a move that", "nestled", "this isn't just X, it's Y", "at the end of the day", "sparked outrage", "leaves residents wondering", "underscores", "a stark reminder", "as the dust settles", three-part lists used for rhythm, and stacked em-dashes.
- Rhythm rules: vary sentence length, allow a short fragment, no two slides opening the same way, no slide opening with a participle ("Following the decision, …").
- Concreteness rules: prefer the specific noun, name, street, number or date from the article over a general one; never summarise a person's view when the article gives their words.
- No editorialising verbs where the article reports plainly ("slammed", "blasted", "hit out").

Loosen the writing a little at the same time: raise the creativity setting on prose slides and add a repetition penalty, so the model stops falling back on the same constructions story after story.

## 2. Rewrite pass on every story

After the first draft, a second, cheap call rewrites the slides against a plain checklist: strip the banned phrases, break up matching sentence rhythms, swap vague nouns for the specific ones in the article, keep every fact, keep the word limits, keep the attribution rules.

Rules for the pass:
- Facts, names, numbers and quotes are frozen — it may only change how something is said.
- If the rewrite drops or alters a fact, or breaks the word limits, the original draft is kept.
- It runs inside the normal generation, so nothing changes in how you approve stories.
- Small extra cost per story (one short call on top of the existing one).

## 3. House style per feed

A new "House style" box in each feed's content settings:

- A few lines in your own words about how that feed should sound.
- A place to paste one or two sentences you like as examples.
- Plus an automatic anchor: the writer is shown three of your recently published, approved stories from that feed and told to match their rhythm and register — not their content.

House style sits on top of the existing tone and audience settings and applies to every story in that feed, including automated ones.

## Technical notes

- `supabase/functions/enhanced-content-generator/index.ts`: extend the slide prompt with the anti-AI-tell, rhythm and concreteness blocks; raise `temperature` from 0.7 to ~0.85 for the slide call and add `frequency_penalty`/`presence_penalty`; add a `humanisePass()` step after slide parsing that re-calls the model with the checklist, then validates slide count, word limits and that no new proper nouns or figures appeared before accepting the rewrite (fall back to the draft otherwise).
- House style: add `house_style_notes` (text) and `house_style_examples` (text) to `topics`, load them where `default_tone` is loaded, and inject them into both the system prompt and the rewrite checklist. Reuse the existing recent-stories fetch to pull three published slide sets from the same topic as style anchors.
- UI: new textarea fields in the feed's content/voice settings panel, auto-saved like the other settings.
- Also apply the anti-tell block to the shorter summary/caption prompt in the same function so captions don't undo the work.
- Keep the existing Flash → Gemini escalation and salvage parser; the rewrite pass uses the same helper.
