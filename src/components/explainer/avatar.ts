/**
 * Presenter configuration for the explainer film.
 *
 * One place to change the HeyGen stock avatar, the designed British voice,
 * and the per-scene clip URLs. Scenes with no entry in CLIPS simply run
 * caption-only, so the film works before any clip exists.
 */

/** HeyGen public avatar look ID used for every scene. */
export const AVATAR_LOOK_ID = '';

/** HeyGen designed voice ID (calm, dry, British editorial). */
export const VOICE_ID = '';

/**
 * Scene id -> hosted clip URL. Keys match the ids in `timeline.ts`.
 * Populate with Lovable asset URLs once the clips are rendered.
 */
export const AVATAR_CLIPS: Partial<Record<string, string>> = {
  // problem: '/__l5e/assets-v1/.../explainer-1-problem.mp4',
  // subject: '...',
  // sources: '...',
  // filter: '...',
  // written: '...',
  // publish: '...',
  // editor: '...',
  // close: '...',
};

export const clipForScene = (sceneId: string): string | undefined => AVATAR_CLIPS[sceneId];
