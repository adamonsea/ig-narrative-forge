/**
 * Presenter configuration for the explainer film.
 *
 * One place to change the per-scene presenter clips. Scenes with no entry in
 * AVATAR_CLIPS simply run caption-only, so the film works before any clip exists.
 */

/** Scene id -> hosted clip URL. Keys match the ids in `timeline.ts`. */
export const AVATAR_CLIPS: Partial<Record<string, string>> = {
  problem: '/__l5e/assets-v1/5851fd8d-77ca-4ec1-b348-fc3ba31e1a8e/v2-1-problem.mp4',
  subject: '/__l5e/assets-v1/dde4772b-5f9a-4794-81d2-760167650afe/v2-2-subject.mp4',
  sources: '/__l5e/assets-v1/a229041d-04a6-45e2-97eb-0842d7c8ce5b/v2-3-sources.mp4',
  filter: '/__l5e/assets-v1/c5abfa48-240a-4558-bc25-d3ef22143da7/v2-4-filter.mp4',
  written: '/__l5e/assets-v1/a3200519-1337-41a7-8def-0ea1a58ba7a1/v2-5-written.mp4',
  publish: '/__l5e/assets-v1/82b20944-4e1c-4a9b-a2da-617eda03b172/v2-6-publish.mp4',
  editor: '/__l5e/assets-v1/dac84b20-c3cf-409f-97b3-320bfd6e480e/v2-7-editor.mp4',
  close: '/__l5e/assets-v1/6f20bf17-2d1f-4ebb-b70f-669be2878496/v2-8-close.mp4',
};

export const clipForScene = (sceneId: string): string | undefined => AVATAR_CLIPS[sceneId];
