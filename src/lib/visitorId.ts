/**
 * Shared visitor ID utility for anonymous user tracking.
 * New readers use the shared browser code. Returning readers retain their exact
 * legacy reaction ID because stored reactions match visitor IDs verbatim.
 */
// Reactions are a feature the reader uses, so they keep the stored ID whatever the counting mode.
import { getStoredVisitorId as getSharedVisitorId, getAnonymousVisitorId } from './visitorIdentity';

export const getVisitorId = (): string => {
  try {
    const legacyId = localStorage.getItem('curatr_visitor_id');
    if (legacyId) return legacyId;
  } catch {
    // Storage may be blocked; use the shared identity fallback.
  }
  return getSharedVisitorId('visitor');
};

/**
 * For showing reaction counts: the reader's existing reaction ID if there is one, without creating one.
 * Nothing is written to the device until the reader actually reacts (getVisitorId above).
 */
export const peekVisitorId = (): string => {
  try {
    const legacyId = localStorage.getItem('curatr_visitor_id');
    if (legacyId) return legacyId;
    const shared = localStorage.getItem('curatr_vid');
    if (shared) return `visitor_${shared}`;
  } catch {
    // Storage blocked: fall through.
  }
  return getAnonymousVisitorId('visitor');
};
