/**
 * A/B Testing Utilities
 * 
 * Provides deterministic variant assignment based on visitor ID hashing.
 * This ensures the same visitor always sees the same variant.
 */

export interface ABTestVariant {
  id: string;
  label: string;
  icon?: string;
}

export interface ABTestConfig {
  name: string;
  variants: {
    A: ABTestVariant;
    B: ABTestVariant;
  };
  startDate: string;
  endDate?: string;
}

// Active A/B tests configuration
export const AB_TESTS: Record<string, ABTestConfig> = {
  subscribe_button_label: {
    name: 'subscribe_button_label',
    variants: {
      A: { id: 'A', label: 'Inbox', icon: 'Mail' },
      B: { id: 'B', label: 'Subscribe', icon: 'Bell' },
    },
    startDate: '2026-02-05',
  },
};

/**
 * Simple hash function that converts a string to a number between 0 and 1
 * Uses djb2 algorithm for consistent hashing
 */
function hashToNumber(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to a number between 0 and 1
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Get the variant assignment for a visitor
 * Returns 'A' or 'B' based on a deterministic hash of the visitor ID
 */
export function getVariant(testName: string, visitorId: string): 'A' | 'B' {
  const hashInput = `${testName}:${visitorId}`;
  const hashValue = hashToNumber(hashInput);
  
  // 50/50 split
  return hashValue < 0.5 ? 'A' : 'B';
}

/**
 * Get the full variant config for a test
 */
export function getVariantConfig(testName: string, visitorId: string): ABTestVariant | null {
  const test = AB_TESTS[testName];
  if (!test) return null;
  
  const variant = getVariant(testName, visitorId);
  return test.variants[variant];
}

/**
 * Check if a test is currently active
 */
export function isTestActive(testName: string): boolean {
  const test = AB_TESTS[testName];
  if (!test) return false;
  
  const now = new Date();
  const startDate = new Date(test.startDate);
  
  if (now < startDate) return false;
  
  if (test.endDate) {
    const endDate = new Date(test.endDate);
    if (now > endDate) return false;
  }
  
  return true;
}

/**
 * Get all active tests
 */
export function getActiveTests(): ABTestConfig[] {
  return Object.values(AB_TESTS).filter(test => isTestActive(test.name));
}

/**
 * Get all tests (active and inactive)
 */
export function getAllTests(): ABTestConfig[] {
  return Object.values(AB_TESTS);
}
