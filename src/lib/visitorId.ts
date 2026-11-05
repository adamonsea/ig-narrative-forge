/**
 * Shared visitor ID utility for anonymous user tracking.
 * Used by story reactions and swipe tracking to identify non-authenticated users.
 */

const VISITOR_ID_KEY = 'curatr_visitor_id';

/**
 * Get or create a persistent visitor ID.
 * Falls back to a session-based ID if localStorage is unavailable.
 */
import { getVisitorId as getSharedVisitorId } from './visitorIdentity';

// One browser code for every tracker, so readers match across tables.
export const getVisitorId = (): string => getSharedVisitorId('visitor');
