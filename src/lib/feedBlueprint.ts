// A feed blueprint chosen on the homepage, held until the wizard can use it.
export interface FeedBlueprint {
  audience_type: string;
  feed_title: string;
  purpose: string;
  sample_story_hooks: string[];
  keywords?: string[];
  suggested_sources?: string[];
}

export interface PendingBlueprint {
  blueprint: FeedBlueprint;
  input: string;
  savedAt: number;
}

const KEY = 'curatr_pending_blueprint_v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export const savePendingBlueprint = (blueprint: FeedBlueprint, input: string) => {
  try {
    const payload: PendingBlueprint = { blueprint, input, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // storage unavailable — the user can still create the feed manually
  }
};

export const readPendingBlueprint = (): PendingBlueprint | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBlueprint;
    if (!parsed?.blueprint?.feed_title) return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearPendingBlueprint = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
