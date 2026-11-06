// @ts-nocheck -- run with: bun test ./src/lib/visitorId.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getVisitorId } from './visitorId';
import { getVisitorId as getTrackingId } from './visitorIdentity';

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