/**
 * Shared visitor ID utility for anonymous user tracking.
 * Uses the same browser code as every other tracker so readers match across tables.
 */
import { getVisitorId as getSharedVisitorId } from './visitorIdentity';

export const getVisitorId = (): string => getSharedVisitorId('visitor');
