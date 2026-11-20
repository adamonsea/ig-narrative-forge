// run with: bun test ./src/lib/visitorId.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getVisitorId, peekVisitorId } from './visitorId';
import { getStoredVisitorId as getTrackingId, getVisitorId as getCountingId, liveUkId } from './visitorIdentity';
import { setReaderOptOut } from './readerConsent';

const LEGACY_ID = '12345678-1234-4234-8234-123456789abc';
const SHARED_ID = 'abcdef0123456789';
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('anonymous reaction identity compatibility', () => {
  test('returns the original raw UUID unchanged across repeated reaction lookups', () => {
    stored.set('curatr_visitor_id', LEGACY_ID);
    expect(getVisitorId()).toBe(LEGACY_ID);
    expect(getVisitorId()).toBe(LEGACY_ID);
    expect(stored.get('curatr_visitor_id')).toBe(LEGACY_ID);
  });

  test('keeps the legacy reaction ID even when the new tracker ID already exists', () => {
    stored.set('curatr_visitor_id', LEGACY_ID);
    stored.set('curatr_vid', SHARED_ID);
    expect(getVisitorId()).toBe(LEGACY_ID);
    expect(getTrackingId('sv')).toBe(`sv_${SHARED_ID}`);
    expect(stored.get('curatr_vid')).toBe(SHARED_ID);
  });

  test('preserves reactions already made using only the new identity', () => {
    stored.set('curatr_vid', SHARED_ID);
    expect(getVisitorId()).toBe(`visitor_${SHARED_ID}`);
    expect(getVisitorId()).toBe(`visitor_${SHARED_ID}`);
  });

  test('new readers get one stable shared identity, not a separate reaction ID', () => {
    const id = getVisitorId();
    expect(id).toMatch(/^visitor_[a-f0-9]{16}$/);
    expect(getVisitorId()).toBe(id);
    expect(getTrackingId('v')).toBe(id.replace(/^visitor_/, 'v_'));
    expect(stored.has('curatr_visitor_id')).toBe(false);
  });

  test('empty legacy storage does not override a valid shared identity', () => {
    stored.set('curatr_visitor_id', '');
    stored.set('curatr_vid', SHARED_ID);
    expect(getVisitorId()).toBe(`visitor_${SHARED_ID}`);
  });
});

describe('per-visit counting (EU before an answer)', () => {
  test('the counting ID is held for this page load only and never written to the device', () => {
    const id = getCountingId('visitor');
    expect(id).toMatch(/^visitor_once_[a-z0-9]{8,16}$/);
    expect(getCountingId('sv')).toBe(id.replace(/^visitor_/, 'sv_'));
    expect(stored.has('curatr_vid')).toBe(false);
    expect(stored.has('curatr_rid')).toBe(false);
  });
});

describe('UK 7-day reader ID', () => {
  const DAY = 86_400_000;
  const at = Date.UTC(2026, 10, 20);
  const raw = JSON.stringify({ id: 'abcdef0123456789', at });
  test('is reused within 7 days of first use', () => {
    expect(liveUkId(raw, at + 6 * DAY + 23 * 3_600_000)).toBe('abcdef0123456789');
  });
  test('expires 7 days after first use', () => {
    expect(liveUkId(raw, at + 7 * DAY)).toBeNull();
  });
  test('rejects anything malformed', () => {
    expect(liveUkId('not json', at)).toBeNull();
    expect(liveUkId(JSON.stringify({ id: 'abcdef0123456789' }), at)).toBeNull();
    expect(liveUkId(null, at)).toBeNull();
  });
  test('opting out deletes it', () => {
    stored.set('curatr_rid', raw);
    setReaderOptOut(true);
    expect(stored.has('curatr_rid')).toBe(false);
    expect(stored.has('curatr_reader_optout')).toBe(true);
  });
});

describe('showing reaction counts', () => {
  test('does not create a stored ID before the reader reacts', () => {
    expect(peekVisitorId()).toMatch(/^visitor_once_/);
    expect(stored.has('curatr_vid')).toBe(false);
  });
  test('uses the existing reaction ID when there is one', () => {
    stored.set('curatr_vid', SHARED_ID);
    expect(peekVisitorId()).toBe(`visitor_${SHARED_ID}`);
    stored.set('curatr_visitor_id', LEGACY_ID);
    expect(peekVisitorId()).toBe(LEGACY_ID);
  });
});
