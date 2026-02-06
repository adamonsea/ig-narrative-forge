/**
 * Demo flow configuration
 * Maps demo UI choices to real topic data with per-topic sources
 */

export interface DemoTopic {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface DemoSource {
  id: string;
  name: string;
  domain: string;
  articleCount: number;
}

export type DemoTone = 'conversational' | 'engaging' | 'satirical';
export type DemoImageStyle = 'editorial_illustrative' | 'editorial_photographic';

export interface DemoStyle {
  tone: DemoTone;
  imageStyle: DemoImageStyle;
}

export const DEFAULT_DEMO_STYLE: DemoStyle = {
  tone: 'conversational',
  imageStyle: 'editorial_illustrative',
};

export const TONE_OPTIONS: { value: DemoTone; label: string }[] = [
  { value: 'conversational', label: 'Conversational' },
  { value: 'engaging', label: 'Engaging' },
  { value: 'satirical', label: 'Satirical' },
];

export const IMAGE_STYLE_OPTIONS: { value: DemoImageStyle; label: string }[] = [
  { value: 'editorial_illustrative', label: 'Illustrative' },
  { value: 'editorial_photographic', label: 'Photographic' },
];

// Map each demo category to its real topic in the database
export const DEMO_TOPIC_MAP: Record<string, { topicId: string; slug: string }> = {
  local: {
    topicId: 'd224e606-1a4c-4713-8135-1d30e2d6d0c6',
    slug: 'eastbourne',
  },
  culture: {
    topicId: 'dbfbd79a-14fe-4c92-9da6-3376b74530f9',
    slug: 'culture-and-arts',
  },
  environment: {
    topicId: 'b2e42a78-e1b2-416c-9885-c28bd1e5c95c',
    slug: 'environment-news',
  },
  community: {
    topicId: '643f3b98-4327-446f-b442-8185537e508c',
    slug: 'community-news',
  },
};

// Per-topic source lists
export const DEMO_SOURCES_BY_TOPIC: Record<string, DemoSource[]> = {
  local: [
    { id: '019be65d-0075-406c-b572-c66e0528731b', name: 'Sussex Express', domain: 'sussexexpress.co.uk', articleCount: 6463 },
    { id: '5c226b7e-300d-4cd6-b856-b391d3c36178', name: 'Bournefree Live', domain: 'bournefreelive.co.uk', articleCount: 2680 },
    { id: '16a372ff-8e02-41a4-abaa-fd24083c2e69', name: 'The Argus', domain: 'theargus.co.uk', articleCount: 552 },
  ],
  culture: [
    { id: '949b5aa2-c961-41b6-8d89-f4e23f74a588', name: 'BBC Culture', domain: 'bbc.co.uk', articleCount: 0 },
    { id: 'b759ffe4-4cbb-4f13-81c7-80a9127494c1', name: 'The Arts Desk', domain: 'theartsdesk.com', articleCount: 0 },
    { id: '1d8c6bb6-2abb-4d5d-a0d2-ce3998f3565e', name: 'The Guardian Culture', domain: 'theguardian.com', articleCount: 0 },
  ],
  environment: [
    { id: '9aa383ec-7625-4f0d-9a22-0bc689ee5060', name: 'BBC Science & Environment', domain: 'bbc.co.uk', articleCount: 0 },
    { id: '84640a0c-7aae-4c14-9bab-15072dfdad6a', name: 'Carbon Brief', domain: 'carbonbrief.org', articleCount: 0 },
    { id: 'c40c78aa-e778-4896-9806-f79ec150df66', name: 'The Guardian Environment', domain: 'theguardian.com', articleCount: 0 },
  ],
  community: [
    { id: '3d30d6fb-ce1d-4f5f-b8e6-22af6cd4cc32', name: 'Third Sector', domain: 'thirdsector.co.uk', articleCount: 0 },
    { id: '1b25daa5-179a-4fd9-b30c-0f4732801891', name: 'Civil Society News', domain: 'civilsociety.co.uk', articleCount: 0 },
    { id: '25ba988d-44db-48e8-9971-06ef8ad09c97', name: 'The Guardian Society', domain: 'theguardian.com', articleCount: 0 },
  ],
};

export const DEMO_TOPICS: DemoTopic[] = [
  { id: 'local', name: 'Local News', icon: '📍', description: 'Hyperlocal stories from your community' },
  { id: 'culture', name: 'Culture & Arts', icon: '🎭', description: 'Events, venues, and creative life' },
  { id: 'environment', name: 'Environment', icon: '🌿', description: 'Parks, nature, and sustainability' },
  { id: 'community', name: 'Community', icon: '🤝', description: 'People, places, and local voices' },
];

// Legacy exports for backward compatibility
export const DEMO_TOPIC_ID = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';
export const DEMO_TOPIC_SLUG = 'eastbourne';
