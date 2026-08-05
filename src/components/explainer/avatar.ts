/**
 * Presenter configuration for the explainer film.
 *
 * One place to change the HeyGen stock avatar, the designed British voice,
 * and the per-scene clip URLs. Scenes with no entry in CLIPS simply run
 * caption-only, so the film works before any clip exists.
 */

/** HeyGen public avatar look ID used for every scene (Tahlia, white shirt). */
export const AVATAR_LOOK_ID = 'Tahlia_public_5';

/** HeyGen voice ID — Pippa, British female, calm and unhurried. */
export const VOICE_ID = '06b68c4dbb544935b9af984e80efa4fb';

/**
 * Scene id -> hosted clip URL. Keys match the ids in `timeline.ts`.
 * Populate with Lovable asset URLs once the clips are rendered.
 */
export const AVATAR_CLIPS: Partial<Record<string, string>> = {
  // Scene 1 uses the live-action presenter (cropped head & shoulders), not the HeyGen avatar.
  problem: '/__l5e/assets-v1/fb8d59b4-f590-4bbf-904e-489fa1c43a28/explainer-1-problem.mp4',
  filter: '/__l5e/assets-v1/9af5cd91-ba43-48ec-8aac-d6500386be3b/explainer-4-filter.mp4',
  written: '/__l5e/assets-v1/7d20fb29-e30e-4a6a-912c-ee5aab678bf9/explainer-5-written.mp4',
  // subject / sources / publish / editor / close: pending — HeyGen monthly render quota reached.
};

export const clipForScene = (sceneId: string): string | undefined => AVATAR_CLIPS[sceneId];
