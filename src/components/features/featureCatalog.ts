import type { FeatureAnimationName } from './FeatureAnimations';
import type { FeatureLoopName } from '@/components/home/FeatureLoops';

export interface HeadlineFeature {
  id: string;
  title: string;
  kicker: string;
  body: string;
  /** ~40 word narration script for the avatar clip */
  script: string;
  animation: FeatureAnimationName;
  /** Path to an avatar clip once produced */
  clip?: string;
}

export interface DepthFeature {
  id: string;
  title: string;
  body: string;
  loop: FeatureLoopName;
  script: string;
}

export interface PlatformGroup {
  group: string;
  items: string[];
}

export const HEADLINE_FEATURES: HeadlineFeature[] = [
  {
    id: 'trawl',
    title: 'Source trawling',
    kicker: '01 — Gathering',
    animation: 'trawl',
    body: 'Curatr watches every source you add — RSS, sitemaps, or plain web pages — around the clock, and pulls new articles in as they appear.',
    script:
      'Add the publications you trust and Curatr watches them for you, day and night. RSS, sitemaps, awkward websites — it adapts to each one, learns what works, and brings every new story back to your desk.',
  },
  {
    id: 'filter',
    title: 'Relevance filtering',
    kicker: '02 — Filtering',
    animation: 'filter',
    body: 'Keywords, locality anchors and negative terms decide what belongs in your feed. Off-topic stories are dropped before they ever reach you.',
    script:
      'Not everything a source publishes belongs in your feed. Curatr scores each story against your keywords, your patch, and the things you never want to see — so what reaches your queue is already worth reading.',
  },
  {
    id: 'briefing',
    title: 'AI briefings',
    kicker: '03 — Writing',
    animation: 'briefing',
    body: 'Every story becomes a short, readable briefing in your own tone of voice, with an optional audio version for listeners.',
    script:
      'Each story is rewritten as a short briefing in your voice — clear, quick to read, and always credited to the original publisher. Prefer to listen? Curatr narrates the whole thing for you.',
  },
  {
    id: 'artwork',
    title: 'AI illustrations',
    kicker: '04 — Illustrating',
    animation: 'artwork',
    body: 'Original editorial artwork for every story. No stock photography, no licensing headaches, and strict guardrails on sensitive subjects.',
    script:
      'Every story gets its own artwork, generated to a house style you choose. No stock libraries, no licensing worries — and sensitive stories are never illustrated, automatically.',
  },
  {
    id: 'publish',
    title: 'Multi-channel publishing',
    kicker: '05 — Publishing',
    animation: 'publish',
    body: 'One approval pushes a story to your public feed, your newsletter, your social carousels, RSS and any site running your embed widget.',
    script:
      'Approve once and the story goes everywhere: your public feed, your email edition, social carousels, RSS, and any website running your embed. One decision, every channel.',
  },
  {
    id: 'control',
    title: 'Editorial control',
    kicker: '06 — Control',
    animation: 'control',
    body: 'Nothing publishes without you. Review, edit, reject or schedule — and see exactly where every story came from.',
    script:
      'You are still the editor. Every story waits in your queue until you approve it, and you can rewrite a line, swap the image, or throw it out entirely. Full attribution travels with it.',
  },
];

export const DEPTH_FEATURES: DepthFeature[] = [
  {
    id: 'play',
    title: 'Play Mode',
    loop: 'play',
    body: 'Readers swipe through stories, hot-or-not style, building a daily habit and teaching your feed what they like.',
    script: 'Play Mode turns your feed into a swipe. Readers rate stories in seconds and the feed learns what they want next.',
  },
  {
    id: 'quiz',
    title: 'Quiz cards',
    loop: 'quiz',
    body: 'Auto-generated knowledge quizzes drawn from your own published stories.',
    script: 'Quiz cards are written from your own coverage — a light, competitive way to keep readers coming back.',
  },
  {
    id: 'sentiment',
    title: 'Sentiment tracking',
    loop: 'sentiment',
    body: 'See which subjects your community warms to, and spot a shift before it becomes a story.',
    script: 'Sentiment tracking shows you how your community feels about the subjects you cover, and when that mood turns.',
  },
  {
    id: 'reels',
    title: 'Reel Studio',
    loop: 'illustrations',
    body: 'Turn any story into a vertical, share-ready reel or a set of static slides, with the source named on every frame.',
    script: 'Reel Studio renders any story as a vertical video or a set of slides, ready to post, with the source credited throughout.',
  },
];

export const PLATFORM_FEATURES: PlatformGroup[] = [
  {
    group: 'Your feed',
    items: [
      'Your own branded feed at a clean public URL',
      'Custom logo, icon and accent colour per topic',
      'Archive, daily and weekly roundup pages',
      'Embeddable widget for any website',
      'Reader newsletter with one-click unsubscribe',
    ],
  },
  {
    group: 'Sources & pipeline',
    items: [
      'Unlimited sources per topic, RSS or web',
      'Automatic source health monitoring and alerts',
      'Duplicate detection across your topic',
      'Manual story upload and staging',
      'Scheduled, unattended publishing',
    ],
  },
  {
    group: 'Insight',
    items: [
      'Visitor, engagement and completion analytics',
      'Per-source performance sparklines',
      'Newsletter open and click reporting',
      'Widget embed tracking by domain',
    ],
  },
  {
    group: 'Trust & compliance',
    items: [
      'Every story links back to its original publisher',
      'Anonymity guard on sensitive court reporting',
      'GDPR-compliant subscriber handling',
      'WCAG 2.1 AA accessible reading experience',
      'Structured data and SEO built in',
    ],
  },
];
