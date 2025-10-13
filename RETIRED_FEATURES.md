# Retired Features

Features that have been removed from the UI but code/infrastructure preserved for potential future use.

---

## Topic Feed CTA Manager
**Retired:** 2025-10-13  
**Reason:** AI is doing a good job with CTAs organically. Manual configuration adds unnecessary complexity at this stage. May revisit when scaling to multi-curator workflows.

### Files Preserved
- `src/components/_archived/TopicCTAManager.tsx` - Full component (244 lines)
- `src/components/EndOfFeedCTA.tsx` - End-of-feed CTA display component (still active)

### Database Schema
**Table:** `feed_cta_configs`

Columns:
- `id` (uuid, primary key)
- `topic_id` (uuid, foreign key to topics)
- `feed_name` (text)
- `engagement_question` (text) - Custom question for story endings
- `show_like_share` (boolean) - Toggle for like/share CTAs
- `attribution_cta` (text, nullable) - Custom text supporting source publications
- `is_active` (boolean) - Enable/disable per topic
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Status:** Table preserved, data retained, not currently read by application

### Original Functionality
Allowed topic owners to manually configure:

1. **Custom engagement questions** - Personalized questions at end of each story
2. **Like/share CTAs** - Toggle visibility of social engagement prompts
3. **Attribution text** - Custom messaging to support original publications
4. **Per-topic activation** - Enable/disable CTA customization per feed
5. **Live preview** - Real-time preview of configured CTA appearance

**UI Location (before retirement):**
- Topic Dashboard → Advanced tab → "Engagement & call-to-action" accordion
- Topic Manager cards → "Manage CTA" button (removed)

### Why It Was Built
Initial vision was to give curators fine-grained control over reader engagement and source attribution messaging, similar to newsletter footer customization.

### Why It Was Retired
1. **AI doing the job well** - Content generator already produces contextually appropriate CTAs
2. **Premature optimization** - Manual configuration adds cognitive load before it's needed
3. **Not wired to generation** - Config was stored but not read during slide generation
4. **Limited differentiation value** - Standard CTAs working fine for current user base

### How to Re-enable

#### Quick restoration (UI only):
1. Move `src/components/_archived/TopicCTAManager.tsx` → `src/components/topic/TopicCTAManager.tsx`
2. In `src/pages/TopicDashboard.tsx`:
   - Add import: `import TopicCTAManager from "@/components/topic/TopicCTAManager";`
   - Add icon: `Megaphone` to lucide-react imports (line ~31)
   - Restore accordion item (insert after "Branding & presentation"):
   ```tsx
   <AccordionItem value="engagement" className="overflow-hidden rounded-lg border border-border/60 bg-background/50 backdrop-blur">
     <AccordionTrigger className="px-4 py-3 hover:no-underline">
       <div className="flex w-full items-start justify-between gap-3 text-left">
         <div className="flex items-center gap-3">
           <Megaphone className="h-4 w-4" />
           <div>
             <p className="text-sm font-medium">Engagement & call-to-action</p>
             <p className="text-xs text-muted-foreground">Configure feed prompts and attribution messaging</p>
           </div>
         </div>
       </div>
     </AccordionTrigger>
     <AccordionContent className="px-4 pb-4">
       <TopicCTAManager
         topicId={topic.id}
         topicName={topic.name}
         onClose={() => loadTopicAndStats()}
       />
     </AccordionContent>
   </AccordionItem>
   ```

#### Full integration (make it functional):
To actually use the CTA configs during content generation:

1. **Read config in content generator:**
   ```typescript
   // In supabase/functions/enhanced-content-generator/index.ts
   const { data: ctaConfig } = await supabaseClient
     .from('feed_cta_configs')
     .select('*')
     .eq('topic_id', topicId)
     .eq('is_active', true)
     .maybeSingle();
   ```

2. **Pass to AI prompt:**
   ```typescript
   // Add to system prompt
   if (ctaConfig) {
     systemPrompt += `\n\nFinal Slide CTA Instructions:
     - End with this question: "${ctaConfig.engagement_question}"
     ${ctaConfig.show_like_share ? '- Include "Like & share" prompt' : ''}
     ${ctaConfig.attribution_cta ? `- Attribution message: "${ctaConfig.attribution_cta}"` : ''}`;
   }
   ```

3. **Render in carousel:**
   ```typescript
   // In src/components/StoryCarousel.tsx or SlideGenerator.tsx
   // Fetch and apply ctaConfig to final slide rendering
   ```

### Related Components (Still Active)
- `src/components/EndOfFeedCTA.tsx` - Newsletter signup at feed end (different purpose)
- `src/components/StoryCarousel.tsx` - Main carousel renderer
- `src/components/SlideGenerator.tsx` - AI slide generation

### Git History Reference
- **Retirement commit:** 2025-10-13
- **Original implementation:** Search git log for "TopicCTAManager" or "feed_cta_configs"
- **Accordion UI pattern added:** 2025-10-13 (same commit as retirement)

---

## Future Archived Features
Additional features will be documented here as they are retired while preserving code/infrastructure.

### Archive Guidelines
When retiring a feature:
1. Document **why** it was built and **why** it's being retired
2. Preserve all code in `src/components/_archived/`
3. Keep database tables/schemas intact (add comment to schema docs)
4. Provide clear re-enablement instructions
5. Note related active components that might be confused with retired feature
