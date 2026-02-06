/**
 * Demo flow configuration
 * Maps demo UI choices to real Eastbourne topic data
 */

export const DEMO_TOPIC_ID = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';
export const DEMO_TOPIC_SLUG = 'eastbourne';

export interface DemoTopic {
  id: string;
  name: string;
  icon: string; // emoji
  description: string;
}

export interface DemoSource {
  id: string;
  name: string;
  domain: string;
  articleCount: number;
}

export const DEMO_TOPICS: DemoTopic[] = [
  { id: 'local', name: 'Local News', icon: '📍', description: 'Hyperlocal stories from your community' },
  { id: 'culture', name: 'Culture & Arts', icon: '🎭', description: 'Events, venues, and creative life' },
  { id: 'environment', name: 'Environment', icon: '🌿', description: 'Parks, nature, and sustainability' },
  { id: 'community', name: 'Community', icon: '🤝', description: 'People, places, and local voices' },
];

export const DEMO_SOURCES: DemoSource[] = [
  { id: '019be65d-0075-406c-b572-c66e0528731b', name: 'Sussex Express', domain: 'sussexexpress.co.uk', articleCount: 6463 },
  { id: '5c226b7e-300d-4cd6-b856-b391d3c36178', name: 'Bournefree Live', domain: 'bournefreelive.co.uk', articleCount: 2680 },
  { id: '16a372ff-8e02-41a4-abaa-fd24083c2e69', name: 'The Argus', domain: 'theargus.co.uk', articleCount: 552 },
];

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
