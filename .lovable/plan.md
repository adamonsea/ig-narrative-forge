

# Enhance Subject Extraction with Landmark Intelligence

## Summary
Enhance the `extractSubjectMatter` function to explicitly identify and name local landmarks, buildings, and locations mentioned in stories. By passing the topic's landmark database to the AI extraction step and adding a dedicated location extraction call, OpenAI can leverage its training knowledge to render these places with approximate accuracy.

## Current State
- Topics already have a `landmarks` TEXT[] column with local places (e.g., "Towner Art Gallery", "Congress Theatre", "Seven Sisters Country Park" for Eastbourne)
- `extractSubjectMatter()` in `prompt-helpers.ts` extracts people and actions but doesn't specifically look for locations
- The topic query in `story-illustrator/index.ts` fetches `region` but not `landmarks`
- OpenAI has training knowledge of famous UK landmarks that we're not currently leveraging

## Implementation Approach

### 1. Extend Topic Query to Include Landmarks
Update the topics query in `story-illustrator/index.ts` to also fetch the `landmarks` array:

```typescript
// Current
.select('illustration_style, illustration_primary_color, region')

// New
.select('illustration_style, illustration_primary_color, region, landmarks')
```

### 2. Create New Location Extraction Function
Add a new function `extractLocationDetails()` in `prompt-helpers.ts` that:
- Takes story content, OpenAI key, and optional landmarks array
- Explicitly prompts GPT-4o-mini to identify places mentioned
- Cross-references with known landmarks for accurate naming
- Returns structured location info (landmark name, architectural style, era)

```typescript
export async function extractLocationDetails(
  slides: SlideContent[],
  openaiKey: string,
  knownLandmarks?: string[],
  region?: string
): Promise<string | null>
```

**Prompt design:**
```
Identify any SPECIFIC LOCATIONS, BUILDINGS, or LANDMARKS mentioned in this story.

KNOWN LOCAL LANDMARKS (prioritize exact matches):
${knownLandmarks?.join(', ') || 'None specified'}

REGION: ${region || 'UK'}

If a location is mentioned:
1. Use the EXACT official name if it matches a known landmark
2. Describe the architectural style/era (e.g., "Victorian pavilion", "Art Deco theatre", "Georgian townhouse")
3. Note any distinctive visual features from public knowledge

Return format: "Towner Art Gallery (modernist white gallery building with angular facade)" or null if no specific location mentioned.

Story text: [content]
```

### 3. Update extractSubjectMatter with Location Context
Modify the existing `extractSubjectMatter` function to accept and incorporate location context:
- Add optional `locationContext` parameter  
- Append location details to the prompt when available
- Instruct the model to incorporate the setting into the subject description

**Enhanced prompt addition:**
```
LOCATION CONTEXT (incorporate into scene if relevant):
${locationContext}

When a specific location is identified, describe the subject IN that setting with architectural accuracy.
Example: "Local councillor Sarah Thompson, 50s, standing in front of the Art Deco facade of Congress Theatre, with its distinctive curved entrance canopy"
```

### 4. Update Prompt Builder Functions
Modify `buildIllustrativePrompt` and `buildPhotographicPrompt` to:
- Accept optional `locationHint` parameter
- Include location-specific rendering instructions when provided

**New section in prompts:**
```
LOCATION ACCURACY (OpenAI knowledge):
Render "${locationHint}" based on your training knowledge of this location.
Use authentic architectural details, proportions, and distinctive features.
```

### 5. Wire It All Together in story-illustrator
Update the main function to:
1. Fetch landmarks from topic
2. Call `extractLocationDetails()` to identify any mentioned places
3. Pass location context to `extractSubjectMatter()`
4. Include location hint in final prompt

## Technical Details

### Files to Modify

**`supabase/functions/_shared/prompt-helpers.ts`**
- Add new `extractLocationDetails()` function (~40 lines)
- Update `extractSubjectMatter()` signature and prompt (~15 lines)
- Update `buildIllustrativePrompt()` and `buildPhotographicPrompt()` (~10 lines each)

**`supabase/functions/story-illustrator/index.ts`**
- Extend topic query to include landmarks (~1 line)
- Call new location extraction function (~10 lines)
- Pass location data through the prompt building chain (~5 lines)

**`supabase/functions/_shared/gemini-prompt-builder.ts`**
- Update `buildGeminiIllustrativePrompt()` and `buildGeminiPhotographicPrompt()` to accept and use location hints (~10 lines each)

### Cost Impact
- Additional GPT-4o-mini call for location extraction: ~$0.00005 per story
- Negligible impact on generation time (~200ms additional)

### Example Flow
**Story about Towner Art Gallery exhibition:**
1. Fetch topic landmarks: `["Towner Art Gallery", "Congress Theatre", ...]`
2. `extractLocationDetails()` returns: `"Towner Art Gallery (modernist white gallery building with angular contemporary facade and large windows)"`
3. `extractSubjectMatter()` returns: `"Gallery curator Maria Santos, woman in her 40s, guiding visitors through bright exhibition space inside Towner Art Gallery"`
4. Final prompt includes: `"Render Towner Art Gallery based on your training knowledge—modernist white angular facade with floor-to-ceiling windows"`
5. OpenAI generates image with recognizable Towner-like architecture

## Benefits
- Leverages OpenAI's existing knowledge of famous UK places
- Stories about recognizable landmarks will have authentic visual context
- Maintains existing behavior when no landmarks are mentioned
- Cost-effective with cheap GPT-4o-mini extraction
- Progressive enhancement—doesn't break existing illustrations

