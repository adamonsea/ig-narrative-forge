import type { AudienceConfig } from './AudienceLanding';

const SCENE_LABELS = {
  sources: 'Sources light up one by one as the day’s article count climbs.',
  filter: 'Irrelevant stories fall away while the relevant ones drop into place.',
  written: 'A story card is illustrated and its headline types itself out.',
  editor: 'One story is approved and published while another is spiked.',
  publish: 'One story fans out to a feed, a newsletter, a site widget, social carousels, ChatGPT and Claude.',
} as const;

const EASTBOURNE_BUTTON = { label: 'See the Eastbourne feed', to: '/feed/eastbourne' };

export const COMMUNITIES: AudienceConfig = {
  path: '/for/communities',
  title: "Curatr for communities - your town's news, in one place",
  description: 'One feed for everything happening locally. Curatr finds, writes, illustrates and publishes it. You stay the editor.',
  hero: { line1: 'Your town has more news than ever...', line2: '...and nowhere to read it.' },
  ideaHints: ['Eastbourne news', 'Brighton events', 'Lewes council & planning', 'Hackney food scene', 'Leeds grassroots football'],
  sceneContent: {
    sources: ['Council', 'Local paper', 'Sports clubs', 'Venues', 'Community blog'],
    keptHeadlines: ['Library to open on Sundays', 'High Street resurfacing starts', 'Youth club reopens next month'],
    headline: 'New skatepark gets the green light',
    editorRows: { published: 'Market returns Saturday', spiked: 'Bus depot rumour', edited: 'Council tax set for April' },
    destinations: ['Your feed', 'Weekly email', 'Website widget', 'Social carousels', 'Claude', 'ChatGPT'],
  },
  sections: [
    { kind: 'split', scene: 'sources', sceneLabel: SCENE_LABELS.sources, lead: 'Every source.', emphasis: 'One feed.', line: 'Council, local papers, clubs, venues and blogs. Read every day, in the background.' },
    { kind: 'split', scene: 'filter', sceneLabel: SCENE_LABELS.filter, lead: 'Local means', emphasis: 'local.', line: 'Stories from the next county stay in the next county.' },
    { kind: 'split', scene: 'written', sceneLabel: SCENE_LABELS.written, lead: 'Simplified. Illustrated.', emphasis: 'Credited.', line: 'Plain-English briefings, each one linked to its source.' },
    { kind: 'split', scene: 'editor', sceneLabel: SCENE_LABELS.editor, lead: 'Your feed. Your', emphasis: 'call.', line: 'Approve, prioritise or spike anything in seconds.' },
    { kind: 'publish', sceneLabel: SCENE_LABELS.publish, lead: 'On your site', emphasis: 'and in their inbox.', line: 'Your feed, a widget on your website, a weekly email and social carousels.' },
    { kind: 'text', lead: 'Already', emphasis: 'live.', line: "Eastbourne's feed runs on Curatr - including on the Eastbourne Chamber of Commerce website.", button: EASTBOURNE_BUTTON },
  ],
  close: { lead: "What's your", emphasis: 'patch?', primary: 'start' },
};

export const ORGANISATIONS: AudienceConfig = {
  path: '/for/organisations',
  title: 'Curatr for organisations - your own news channel',
  description: 'Stop renting attention. Build a feed your audience follows, on your subject, in your voice, signed off by you.',
  hero: { line1: 'Paid media rents you an audience...', line2: '...a feed lets you keep one.' },
  ideaHints: ['Renewable energy policy', 'NHS workforce', 'Charity fundraising', 'Cyber security', 'Housing law'],
  sceneContent: {
    sources: ['Trade press', 'Journals', 'Regulators', 'Industry news', 'Analysts'],
    keptHeadlines: ['New guidance published', 'Sector funding round opens', 'Skills gap widens'],
    headline: 'Regulator sets out new reporting rules',
    editorRows: { published: 'Members’ update', spiked: 'Off-topic celebrity story', edited: 'Consultation closes Friday' },
    destinations: ['Branded feed', 'Newsletter', 'Site widget', 'Social carousels', 'Claude', 'ChatGPT'],
  },
  sections: [
    { kind: 'split', scene: 'sources', sceneLabel: SCENE_LABELS.sources, lead: 'Your field,', emphasis: 'covered.', line: 'Trade press, journals, regulators and news. Tracked daily, in the background.' },
    { kind: 'split', scene: 'filter', sceneLabel: SCENE_LABELS.filter, lead: 'Only what your', emphasis: 'audience needs.', line: 'Off-topic noise never reaches them.' },
    { kind: 'split', scene: 'written', sceneLabel: SCENE_LABELS.written, lead: 'In your', emphasis: 'voice.', line: 'One tone, one look, every story linked to its source. Handy when compliance asks.' },
    { kind: 'split', scene: 'editor', sceneLabel: SCENE_LABELS.editor, lead: 'Signed off', emphasis: 'by you.', line: 'Nothing publishes without approval. Drip feed the good stuff.' },
    { kind: 'publish', sceneLabel: SCENE_LABELS.publish, lead: 'From everywhere', emphasis: 'to everyone.', line: 'Your branded feed, a newsletter, a widget on your site, social carousels, and ChatGPT & Claude.' },
    { kind: 'text', lead: 'See what', emphasis: 'lands.', line: 'Readership for every feed, so you know what people actually read.' },
  ],
  close: { lead: 'What does your audience', emphasis: 'follow?', primary: 'talk' },
};

export const AGENCIES: AudienceConfig = {
  path: '/for/agencies',
  title: 'Curatr for agencies - give every client a newsroom',
  description: 'An always-on news feed for each client. Curatr does the trawling and writing. You keep the editorial control and the relationship.',
  hero: { line1: 'Every client wants more content...', line2: '...give them a newsroom.' },
  ideaHints: ['Fintech regulation', 'Luxury travel', 'Plant-based food', 'EV charging', 'Construction safety'],
  sceneContent: {
    sources: ['Client news', 'Trade press', 'Competitors', 'Influencers', 'PR wires'],
    headline: 'Plant-based sales reach a new high',
    editorRows: { published: 'Fintech rules tighten', spiked: 'Off-brand rumour', edited: 'Luxury rail routes return' },
    destinations: ['Client feed', 'Newsletter', 'Client site', 'Social carousels', 'Claude', 'ChatGPT'],
  },
  sections: [
    { kind: 'split', scene: 'sources', sceneLabel: SCENE_LABELS.sources, lead: 'One desk.', emphasis: 'Many feeds.', line: 'Run one client feed or ten. Each one tracked daily, in the background.' },
    { kind: 'split', scene: 'written', sceneLabel: SCENE_LABELS.written, lead: 'Their look.', emphasis: 'Their tone.', line: "Each feed carries the client's style. Every story linked to its source." },
    { kind: 'split', scene: 'editor', sceneLabel: SCENE_LABELS.editor, lead: 'Nothing goes out', emphasis: 'without you.', line: 'Approve, prioritise or spike before anything goes live.' },
    { kind: 'publish', sceneLabel: SCENE_LABELS.publish, lead: 'Feeds, emails,', emphasis: 'widgets, carousels.', line: 'One story, every channel your client cares about - including ChatGPT & Claude.' },
    { kind: 'text', lead: 'Always', emphasis: 'on.', line: 'A monthly service clients keep, without a writer on it every day.' },
    { kind: 'text', lead: 'See it', emphasis: 'live.', line: 'This local feed runs on Curatr.', button: EASTBOURNE_BUTTON },
  ],
  close: { lead: 'Got a client', emphasis: 'in mind?', primary: 'talk' },
};
