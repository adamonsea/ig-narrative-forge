
# Fix Illustration Style Drift — Stronger Anti-Realism Guardrails

## The Problem

GPT Image 1.5 is progressively generating more detailed, realistic illustrations despite the prompt instructing flat risograph/screen print style. The farmers image shows the target aesthetic; the fiddler and tennis images show unwanted detail creep (fine cross-hatching, realistic shading, detailed facial features, perspective depth).

This happens because:
- The `FORBIDDEN ELEMENTS` section sits at the **end** of the prompt where it has less weight
- The subject description in the middle pulls the model toward narrative realism
- References to "Edward Hopper" and "cinematic perspective" actively encourage realism
- No structural reinforcement of flatness constraints near the subject description

## The Fix

Restructure `buildIllustrativePrompt` in `supabase/functions/_shared/prompt-helpers.ts` with three changes:

### 1. Lead with the ban list (strongest position in prompt)

Move `FORBIDDEN ELEMENTS` to the very top, before any subject matter. GPT Image models weight early instructions more heavily. Rename to `ABSOLUTE CONSTRAINTS` for stronger language.

### 2. Remove realism-encouraging references

- Remove "Edward Hopper" (painter of atmospheric realism — directly contradicts the goal)
- Remove "cinematic perspective with narrative depth" (encourages photographic depth)
- Keep "Jon McNaught" (genuinely flat print artist) and add "Riso Club" / "Risograph" as primary style anchors
- Replace "Architectural, modernist composition" with "Poster-flat composition"

### 3. Add a style lock wrapper around the subject

Wrap the subject matter in explicit flatness reminders so the model doesn't drift when interpreting the narrative content:

```
SUBJECT (render in FLAT PRINT STYLE — no realism):
[subject matter here]
(Remember: this subject must be rendered as a flat screen print, not a realistic scene)
```

## Technical Details

### File: `supabase/functions/_shared/prompt-helpers.ts` (lines 273-312)

Restructured prompt output:

```
ABSOLUTE CONSTRAINTS (read these FIRST):
- NO crosshatching, NO halftone dots, NO fine line detail
- NO realistic shading or smooth gradients
- NO detailed facial features — simplified geometric forms only
- NO perspective depth or atmospheric effects
- NO photorealistic rendering of any kind
- Maximum 3-4 flat colors total (black, white/cream, accent)
- Every surface must be a SOLID FLAT fill — no blending

STYLE: Risograph / screen print editorial illustration for [publication].
Think: Riso Club zine cover, Jon McNaught, Paul Rand poster.

SUBJECT (render as FLAT SHAPES — not realistic):
[subject matter]

PALETTE: Black outlines + [primaryColor] accent + cream paper background.
Paper texture visible throughout. Slight ink registration shifts.

COMPOSITION: Poster-flat arrangement. Large simple shapes.
1-3 main visual elements. 60%+ negative space.
Human figures = basic geometric forms (circle heads, rectangle bodies).
[expression guidance]

[place guidance if applicable]
[location accuracy if applicable]

FORMAT: Landscape 3:2 for editorial cover use.
```

### File: `supabase/functions/_shared/gemini-prompt-builder.ts` (lines 100-130)

Apply the same constraint-first restructuring to `buildGeminiIllustrativePrompt` for consistency, though this is currently less used. Move `CONSTRAINTS/EXCLUSIONS` section to the top of the prompt.

## Why This Should Work

- Prompt position matters: constraints at the **start** get more attention than at the end
- Removing "Edward Hopper" and "cinematic perspective" eliminates realism anchors
- Wrapping the subject in flatness reminders prevents narrative-driven drift
- Stronger language ("ABSOLUTE CONSTRAINTS", "FLAT SHAPES — not realistic") reduces ambiguity
- The target aesthetic (farmers image) used this same model, so the model *can* produce it — it just needs tighter guardrails
