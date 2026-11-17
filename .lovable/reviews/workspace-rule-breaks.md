# Workspace rule breaks

Checked against the knowledge rules and the /design page. **All groups done 17 Nov 2026** (parked or hidden panels left alone). Counts are the lowest confirmed; a few legacy Sources screens that owners can't reach are left out.

Rule key: **Size** = text outside 32/24/18/16/14 or tiny text · **Caps** = uppercase or spaced-out labels · **Colour** = raw colours instead of the workspace palette · **Purple** = violet used as a button fill · **Words** = helper lines, Title Case, emoji, long labels · **Modal** = pop-up used for editing instead of the side drawer · **Spinner** = spinner where a skeleton belongs · **Motion** = movement other than live-pulse, flow-draw, settle-in · **Space / Radius** = off the 4–48 scale, or corners other than 8 / 12 / round

---

## 1. Shared building blocks (done 17 Nov; health dots on tinted cards keep the darker green for contrast; one shared `WorkspaceDrawer` added and shown on /design; /design live-pulse shows white on the mint Live now bar and pop green elsewhere, as Adam chose)

- **Desk motion doesn't match /design**: the Live now dot uses a white "ping", not `live-pulse`. The `live-pulse` style itself pulses violet (index.css 461).
- **Health dots** use the dark green `mint-ink`, but the rules say `pop` (sources/SourceCard.tsx 18).
- **Save indicator**: tiny text plus a spinning ring (index.css 437, ui/editorial.tsx 87).
- **Feed live/draft pill**: tiny text (ui/editorial.tsx 136).
- **Autopilot pill**: tiny text, and its tooltip is a full sentence (topic-pipeline/PoolGlance.tsx 107–108).
- **"New" badge**: tiny text (ui/new-content-badge.tsx 26).
- **Badge**: tiny text by default and off-scale padding (ui/badge.tsx 7).
- **DeskBadge "warning"**: uses the generic accent colour, not amber (topic-pipeline/DeskCard.tsx 133).
- **Buttons**:
  - Corners are 6px, not 8px (ui/button.tsx 8, 24, 25).
  - Default height is 40px and Desk card actions are 32px, not the 44px touch size (DeskCard.tsx 120).
- **Section header and empty-page block**: use the serif display font for ordinary titles, plus an odd 28px size (ui/editorial.tsx 72, 165).
- **Pop-up, confirm box and drawer backdrops**: raw black (ui/dialog.tsx 22, ui/alert-dialog.tsx 19, ui/sheet.tsx 22).
- **Drawer**:
  - Slides in, which is not one of the three allowed motions (ui/sheet.tsx 36–41).
  - The Desk's drawers never become bottom sheets on phones.
- **Tooltip and popover**: 6px corners plus zoom/slide motion (ui/tooltip.tsx 20, ui/popover.tsx 20).
- **Folds** (RememberedFold, Disclosure): slide open (settings/RememberedFold.tsx 82, 97).
- **Menu shortcuts**: tiny, spaced-out text (ui/dropdown-menu.tsx 175).
- **Others**: average-stories badge has tiny text and raw emerald (ui/average-daily-stories-badge.tsx 22); style tooltip has tiny text (ui/style-tooltip.tsx 80, 83); sidebar has tiny text in four places.
- **No shared error state** exists yet ("one sentence + one fix"), so every screen does its own.

## 2. Desk — fixed 17 Nov 2026
Shared drawer pass done 17 Nov: link editor, slide editor, animation instructions, Add story and Reel all open in `WorkspaceDrawer`. Remaining by choice: in-button spinners while an action runs; ApprovedStoriesPanel and MultiTenantStoriesList are no longer shown on the Desk, so their colours and tiny text were left alone.

- **Colour**:
  - The load-error banner is raw amber (UnifiedContentPipeline.tsx 363, 365).
  - Older story lists use green, yellow, red, blue and white: ApprovedStoriesPanel 565–764, MultiTenantStoriesList 268–671, MultiTenantArticlesList 268–269.
  - The image style picker uses raw blue, grey and amber (ImageModelSelector 143–241).
  - LinkEditor 164; AnimationInstructionsModal 128.
- **Size**:
  - Drawer titles are 20px: StoryDrawer 175, WaitingStoryDrawer 87, event drawer DeskEvents 244, HappenedSettings 21.
  - The "Published" glance number is 20px (PoolGlance 16).
  - Next-gather time uses the serif at 48–60px (insight/NextGatherPanel 153).
  - Tiny text in the event date tile (DeskEvents 24, also uppercase), PoolGlance 18, animation quality and instructions, the image style picker (10 places), link and slide editors, reel studio, MultiTenantStoriesList (11 places), ApprovedStoriesPanel (15 places), AddStoryDialog 330–332.
- **Words**:
  - The empty Live now has a big icon and two lines (UnifiedContentPipeline 503–507).
  - LinkEditor uses "Add Link", "Link Text" and "Current Links".
  - "Recovery Failed" toast in Title Case (UnifiedContentPipeline 352).
- **Spinner / motion**:
  - "Being written" spins in the Live now bar (UnifiedContentPipeline 485).
  - Processing rows spin (PublishedStoriesList 340).
  - AddStoryDialog 263.
- **Modal** (editing in a pop-up instead of the drawer): link editor, slide editor, animation instructions, reel studio, Add story.
- **Icon button without a label**: the × that removes a link (LinkEditor 160).
- **Badge rows**: older approved cards show three badges (ApprovedStoriesPanel 608–623).
- **Space**: StoryDrawer 10 lines, WaitingStoryDrawer 9, DeskEvents 13, StoryFilters 5. DeskCard actions use a 6px gap.

## 3. Sources (done 17 Nov; edit-source and older-stories now open in the shared drawer — done)

- **Size**:
  - Drawer and shelf titles are 20px: AddSourceSheet 70, NewsSourcePanel 67, EventSources 275, SourceShelves 36.
  - Tiny text in cooldown badges, live count, processing status, health dot and indicator tooltips, sparkline (10–11px), status indicator and gathering progress.
- **Colour**:
  - Raw green, yellow, red, blue and orange in the health dot, sparkline, status indicator, gathering progress, processing status and the source actions menu.
  - UnifiedSourceManager 1518, 1701, 1709.
- **Words**: status labels with emoji (🔴 🟡 🟢 ⚪) in UnifiedSourceManager 1312–1335, used in older status helpers.
- **Modal**: the "older stories" setup (UnifiedSourceManager 1583) and source editing (1998).
- **Spinner**: "Finding sources…" (SourceFinder 129) and the sparkline loading (SourceStorySparkline 99).
- **Space**: AddSourceSheet 4, SourceShelves 4, NewsSourcePanel 9, EventSources 9.

## 4. Settings (done 17 Nov; AI-assistant connection and email preview open in the shared drawer — done; About page and donations auto-save with the save dot, Save buttons removed — done; Categories shows one primary button at a time — done; tiny text in parked panels left alone)

- **Size**:
  - Section and fold titles are 20px on phones (EditorialControlCenter 116, RememberedFold 75).
  - Widget numbers are 20px bold (WidgetAnalytics 194–212).
  - Tiny text in parked or hidden panels (community discussion, email segments, mood keywords, MPs, trending review).
- **Purple**: the selected Autopilot level fills violet (TopicAutomationSettings 174, also 6px corners).
- **Words**:
  - "Let big stories through" is 4 words (NewsValuesPanel).
  - AI assistants: "Copy this now — it is shown once." and "You'll also need a key from the Keys list below…" (AiAssistantAccess 193, 300).
  - Picture references: "Tap the ones that look right" and "Dismissed suggestions are never offered again." (PictureReferences 352, 592).
- **Modal**: AI assistants connection (AiAssistantAccess 270), feed backups, email preview.
- **Spinner / motion**: the release timing save spins (DripFeedSettings 121).
- **Saving**: done — About page and donations auto-save (Adam, 17 Nov).
- **Radius / Space**: branding 4 places, Onboarding 2, PictureReferences 2, ContentVoice notes box. Space: CategoriesPanel 6, PictureReferences 7, AiAssistantAccess 5, WidgetAnalytics 5, EditorialControlCenter 13 lines.

## 5. Readership (done 17 Nov)

- **Size**: the weekly reads number uses the serif at 96–128px (ReadershipPanel 87); the best story is 72–96px, its title in serif (121–122); a 48px serif number (138); tiny chart text (107, 164, 169).
- **Funnel**: tiny, uppercase, spaced-out heading, plus raw green, yellow, red and white (EngagementFunnel 64–171).
- **Spinner**: the funnel loads with a spinner (EngagementFunnel 57).
- **Space**: 56px and 40px gaps (ReadershipPanel 83–84, 120).

## 6. Dashboard and new-feed setup (done 17 Nov; backups and feed safety open in the shared drawer — done)

- **Size**:
  - The "Your feeds" heading is serif at 36px (Dashboard 55).
  - The feed name on its own page is 24/30px, not 32px (TopicDashboard 647).
  - The "Feed not found" heading is serif at 36px (TopicDashboard 625).
  - The weekly readers number is 36px (FeedStatsCard 223).
  - Feed card titles are 20px (TopicManager 296).
  - The new-feed screens use 30–36px headings and 20px inputs (CreateTopicDialog 404–532, FeedBuildProgress 195, FeedSetupPreview 95, FeedSetupGuide 146).
  - Tiny text: TopicDashboard 649, AppLayout 81, sidebar "Sign Out", TopicManager "View", FeedStatsCard 206–288, FeedSetupGuide, OwnerAssistant (11px), FeedBackups (10px).
- **Caps**: CreateTopicDialog 484, FeedBuildProgress 271, OwnerAssistant 188, FeedSetupGuide 177.
- **Colour**: raw white header (AppLayout 52).
- **Purple**: the feed card "View" turns violet on hover (TopicManager 308).
- **Words**:
  - "Sign Out" in Title Case.
  - Card note "Visits jumped while readers stayed flat, so the rise is likely automated traffic." (FeedStatsCard 288).
  - "Ask anything about running your feed" (OwnerAssistant 136).
  - "Add at least one source to continue." and "Add at least one keyword to continue." (FeedSetupGuide 320, 323).
- **Spinner**: the dashboard and feed pages load with spinners (Dashboard 28, TopicDashboard 615).
- **Modal**: feed backups, feed safety. Publishing a feed asks in a confirm box, and it isn't a destructive action (TopicDashboard 816).

## 7. Reviews (done 17 Nov)

- **Size**: tiny text in 10 places (PeriodReviewPanel 242–387).
- **Words**: "Nothing selected means everything is included." (313).
- **Space**: 5 lines.

---

Not in this list and still open: the Widgets page (/dashboard/widgets) has tiny text in 17 places; it wasn't part of this audit.

Already fine: delete confirmations use the confirm box (Reviews, Clean up, delete feed), which the rules allow.
