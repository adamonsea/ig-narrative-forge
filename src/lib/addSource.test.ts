// run with: bun test ./src/lib/addSource.test.ts
import { describe, expect, it } from 'bun:test';
import { addSourceHost, addSourceNameFromLink } from './addSource';
import { detectSourceKind, isEventsSourceKind } from './whatsOn';

describe('Add source wizard', () => {
  it('step one only moves on with a usable link', () => {
    expect(addSourceHost('')).toBe('');
    expect(addSourceHost('not a link')).toBe('');
    expect(addSourceHost('localhost')).toBe('');
    expect(addSourceHost('www.Eastbourne.news/feed')).toBe('eastbourne.news');
    expect(addSourceHost('webcal://example.org/cal.ics')).toBe('example.org');
  });

  it('suggests a name from the link', () => {
    expect(addSourceNameFromLink('https://www.eastbourne-herald.co.uk/news')).toBe('Eastbourne Herald');
    expect(addSourceNameFromLink('feeds.bbci.co.uk/news/rss.xml')).toBe('Bbci');
  });

  it('routes calendar feeds to the what\'s-on step and RSS to the news step', () => {
    expect(isEventsSourceKind(detectSourceKind('https://example.org/events.ics'))).toBe(true);
    expect(isEventsSourceKind(detectSourceKind('https://example.org/feed/'))).toBe(false);
  });
});
