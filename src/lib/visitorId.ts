/**
 * Shared visitor ID utility for anonymous user tracking.
 * New readers use the shared browser code. Returning readers retain their exact
 * legacy reaction ID because stored reactions match visitor IDs verbatim.
 */
import { getVisitorId as getSharedVisitorId } from './visitorIdentity';

export const getVisitorId = (): string => {
  try {
    const legacyId = localStorage.getItem('curatr_visitor_id');
    if (legacyId) return legacyId;
  } catch {
    // Storage may be blocked; use the shared identity fallback.
  }
  return getSharedVisitorId('visitor');
};
