# Language audit: highlights, not "AI-first"

Positioning: Curatr pulls the highlights from the stories that matter to your audience, credits every source and brings them together in one on-brand feed. It simplifies and summarises real reporting. AI is named honestly in one place, not used as a selling point.

## 1. Strings to change (grouped by screen)

### Site-wide title, search and structured data
| File | Now | Proposed |
|---|---|---|
| src/routes/__root.tsx:27 | "Curatr - AI-Curated News Feeds" | "Curatr - Curated news feeds, every source credited" |
| src/routes/__root.tsx:28 | "...curated news feeds powered by AI..." | "Follow the highlights from the stories that matter to you, each one credited to its source." |
| src/components/seo/GlobalSEO.tsx:21 | "AI-powered curated news feeds..." | "Curated news feeds: the highlights from trusted sources, every one credited." |
| GlobalSEO.tsx:50 | "...AI-powered content curation and gamified..." | "Platform for on-brand curated news feeds that credit every source." |
| GlobalSEO.tsx:56 (keyword) | "AI-powered journalism" | "curated news" (**flag:** this one also claims something false, so remove it) |
| src/pages/Discover.tsx:49 | "...— powered by AI." | "...— every story credited." |

### Home, landing and features pages
| File | Now | Proposed |
|---|---|---|
| featureCatalog.ts:50 | "AI briefings" | "Briefings in your voice" |
| featureCatalog.ts:55 | "Each story is rewritten as a short briefing..." | "Each story is summarised into a short briefing in your voice..." |
| featureCatalog.ts:59 | "AI illustrations" | "On-brand pictures" |
| featureCatalog.ts:64 | "...artwork, generated to a house style..." | "...artwork, drawn to a house style you choose..." (**flag:** must still say the pictures are illustrations, not photos) |
| featureCatalog.ts:82 | "...rewrite a line..." | "...change a line..." |
| featureCatalog.ts:98 | "Auto-generated knowledge quizzes..." | "Quick quizzes drawn from your own published stories." |
| Features.tsx:21 | "Your channel, inside your AI" | "Read in ChatGPT & Claude" |
| FeatureScenes.tsx:1040, FeatureLoops.tsx:26, FeatureAnimations.tsx:115 (screen-reader labels) | "An AI assistant answering...", "...generated artwork" | "ChatGPT or Claude answering...", "...a new picture" |
| demo/DemoBuildProgress.tsx:15 | "AI is summarising in your voice" | "Summarising in your voice" |
| SourceOnboardingTicker.tsx:46 | "AI discovers sources based on..." | "Finding sources that fit your topic" |
| FeedIdeaGenerator.tsx:116 | "We could not generate ideas..." | "No ideas just now. Try again." |
| Sample headlines ("AI spots rare disease", "AI & ethics", "AI in photography") | topic examples | keep: these are example news subjects, not claims |

### Guide page (src/pages/guides/LocalNewsFeeds.tsx)
| Line | Now | Proposed |
|---|---|---|
| 43–44 | "Let AI simplify & rewrite" / "The AI preserves every source link" | "Simplified and credited" / "Each story is summarised into its key points, with a link back to the original." |
| 98, 116–139 (title, meta, schema) | "...News Feed Using AI", "AI-powered curation" | "How to build and grow a local news feed", "curated, credited feeds" |
| 219 | "...using AI — without writing every story by hand" | "...without writing every story by hand" |
| 352 | "What AI actually does for you" | "What Curatr does for you" |
| 364 | "...rewritten into punchy, readable summaries" | "...summarised into clear key points" |
| 367 / 371 | "AI illustrations" / "Auto-generated quizzes" | "On-brand pictures" / "Quick quizzes" |
| new | — | add the honest "How Curatr works" line (see 3) |

### Pricing
| File | Now | Proposed |
|---|---|---|
| Pricing.tsx:19 | "RSS, email, widgets and AI assistant access" | "RSS, email, widgets, and reading in ChatGPT & Claude" |
| CreditScaleTable / credit copy | already says "pictures" | no change found |

### Owner workspace (Desk, Settings, setup)
| File | Now | Proposed |
|---|---|---|
| onboarding/FeedSetupGuide.tsx:130 | "Every story is rewritten in this voice..." | "Every story is summarised in this voice — and illustrated in this style — for you to check." |
| settingsIndex.ts:30 | "How generated pictures look." | "How your pictures look." |
| settingsIndex.ts:72, assistantDestinations.ts:39–40, AiAssistantAccess.tsx:127–128 | "AI assistants" | "Read in ChatGPT & Claude" |
| events/EventEditorialPanel.tsx:78 | "Rewrite" | "Redraft" |
| TopicInsightSettings.tsx:219 | "AI-generated quiz questions..." | "Quiz questions from your stories" |
| TopicInsightSettings.tsx:86 / AudienceProgressCard.tsx:140,187 | "...regenerated!", "Regenerate" | "Updated", "Refresh" |
| MultiTenantStoriesList.tsx:104–145, 359 / PublishedStoriesList.tsx:259–269 | "Illustration Generated Successfully", "Failed to generate illustration", "Generated stories will appear here" | "Picture ready", "Couldn't draw the picture. Try again.", "New stories appear here for you to check." |
| categories/PeriodReviewPanel.tsx:209–409 | "Generate review", "Review generated" | "Make review", "Review ready" |
| categories/CategoriesPanel.tsx:74 | "AI classification is blocked — the workspace AI credit limit..." | "Sorting is paused — out of credits." |
| reels/ReelStudioModal.tsx:89 | "Could not generate the reel." | "Couldn't make the reel." |
| EventsListing.tsx:183 | "Generate events from..." | "Add a what's-on source to see events." |

### Emails
| File | Now | Proposed |
|---|---|---|
| _shared/waitlist-email.ts:134,178 and WaitlistWelcome.tsx:106 | "...trawls the sources, rewrites the stories and illustrates them daily." | "...gathers the highlights from every source, credits each one and illustrates them daily." |
| Briefing / daily / weekly emails | no breaking wording found | no change |

### Reader feed, widget, RSS, ChatGPT/Claude access
| File | Now | Proposed |
|---|---|---|
| mcp-feed/index.ts:267,269 (error) | "This feed is not available to AI assistants" | "This feed is not available in ChatGPT or Claude" |
| mcp-feed instructions | neutral ("editorially curated") | no change |
| Mcp.tsx (developer docs page) | "Curatr for AI assistants" | "Read Curatr in ChatGPT & Claude"; technical body stays, as it's for developers |
| Public feed, last slide, widget, RSS | no breaking wording found (code comments only) | no change |

### Legal
- Terms.tsx:49 "Transform and summarise content using AI technology": keep. This is the honest legal statement.
- Privacy policy: **no list of AI providers exists today.** Add a short "Who processes content" list (OpenAI, Google, Replicate, ElevenLabs, as used). **Flag:** without it, removing AI from marketing would leave no disclosure.

## 2. Claims that would mislead without "AI" (flagged)
- Pictures must stay described as illustrations/artwork, never as photos.
- "Summarised in your voice" must keep "for you to check" where the owner sets things up, because highlights are drafted automatically.
- "AI-powered journalism" is removed, not reworded. Curatr doesn't do journalism.
- Audio briefings: keep "narrated", never imply a human reader.

## 3. The one honest "How Curatr works" line
- **Readers:** one line at the foot of the feed's About/menu sheet and on each story page under the source credit: "How Curatr works: highlights are drafted with AI help from the original reporting and checked by [feed name]. Every story links to its source."
- **Owners:** one line in Settings → Writing beside the voice control: "Highlights are drafted with AI help from the original reporting. You review them before they go live." The same line goes on the pricing page FAQ and the guide page.
- Privacy policy holds the provider list. Admin screens stay as they are.

## 4. Out of scope
Admin-only screens (AI cost dashboard, Ideogram tests, prompt optimiser, quality analyser, admin panel), code comments, function names, and stored story text.

## 5. Standing language guide
- Already added to project knowledge by Adam; no memory save needed.
- Add a small test under src/test that fails if banned phrases ("AI-powered", "rewritten", "auto-generated", "AI illustrations", "AI briefings") reappear in featureCatalog, root/GlobalSEO meta, pricing features or the waitlist email.

## Technical notes
- Copy-only changes plus one privacy-policy section and two new single-line notes. No logic, data or flow changes.
- Workspace copy follows the words rule: fewest words, no exclamation marks.
- Run feed_smoke.py afterwards (feed/Desk files are touched).
