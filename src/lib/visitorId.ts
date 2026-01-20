/**
 * Shared visitor ID utility for anonymous user tracking.
 * Used by story reactions and swipe tracking to identify non-authenticated users.
 */

const VISITOR_ID_KEY = 'curatr_visitor_id';

/**
 * Get or create a persistent visitor ID.
 * Falls back to a session-based ID if localStorage is unavailable.
 */
export const getVisitorId = (): string => {
  const fallback = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    let visitorId = localStorage.getItem(VISITOR_ID_KEY);
    if (!visitorId) {
      const uuid = globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : fallback();
      visitorId = uuid;
      localStorage.setItem(VISITOR_ID_KEY, visitorId);
    }
    return visitorId;
  } catch {
    // localStorage can be blocked (e.g. private mode). Still return a stable-ish id.
    return fallback();
  }
};
