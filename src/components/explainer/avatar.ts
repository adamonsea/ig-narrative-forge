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
  // Live-action presenter, cut from the full narration take (cropped head & shoulders).
  problem: '/__l5e/assets-v1/9cf31c20-f8d3-484d-9527-5f04f6b56eba/explainer-1-problem.mp4',
  subject: '/__l5e/assets-v1/b91dfdc2-aece-4a2c-a267-cb80b35854dd/explainer-2-subject.mp4',
  sources: '/__l5e/assets-v1/73187b3e-5623-461e-b6b0-3a1ed546626b/explainer-3-sources.mp4',
  // 'filter' has no line in the live-action take, so it runs caption-only.
  written: '/__l5e/assets-v1/16ac7a05-a9ad-4027-ad4a-1820cb3088f9/explainer-5-written.mp4',
  publish: '/__l5e/assets-v1/0c3b533e-553d-4fa4-9eb2-6d278ea9b832/explainer-6-publish.mp4',
  editor: '/__l5e/assets-v1/c443afa9-738d-43bb-a49c-d7eb33243373/explainer-7-editor.mp4',
  close: '/__l5e/assets-v1/a5237b5c-f8ef-4110-a641-1ac0db06d39d/explainer-8-close.mp4',
};

export const clipForScene = (sceneId: string): string | undefined => AVATAR_CLIPS[sceneId];
