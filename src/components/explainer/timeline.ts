import type { ComponentType } from 'react';
import type { SceneProps } from './scenes';
import {
  SceneProblem,
  SceneSubject,
  SceneSources,
  SceneFilter,
  SceneWritten,
  ScenePublish,
  SceneEditor,
  SceneClose,
} from './scenes';

export interface SceneDef {
  id: string;
  /** Beat length in milliseconds — matched to the presenter clip for this scene. */
  duration: number;
  /** Narration line, also used as the on-screen caption. */
  caption: string;
  /** Optional presenter clip for this beat; falls back to AVATAR_CLIPS by id. */
  avatarClip?: string;
  Component: ComponentType<SceneProps>;
}

export const TIMELINE: SceneDef[] = [
  {
    id: 'problem',
    duration: 6900,
    caption:
      'Stories are out there. Finding them, writing them, and making them look good is the hard bit.',
    Component: SceneProblem,
  },
  {
    id: 'subject',
    duration: 6250,
    caption: 'Start with a place, or a subject. A town, a passion, a cause.',
    Component: SceneSubject,
  },
  {
    id: 'sources',
    duration: 5350,
    caption: 'Curatr trawls selected sources for you — every day, in the background.',
    Component: SceneSources,
  },
  {
    id: 'filter',
    duration: 6300,
    caption: "It keeps only what's relevant. The rest never reaches you, let alone your audience.",
    Component: SceneFilter,
  },
  {
    id: 'written',
    duration: 6600,
    caption:
      "What's left is simplified into clean, readable briefings — and then illustrated automatically.",
    Component: SceneWritten,
  },
  {
    id: 'publish',
    duration: 7800,
    caption:
      'Then it publishes itself. Your own feed, your newsletter, a widget on your site, social carousels.',
    Component: ScenePublish,
  },
  {
    id: 'editor',
    duration: 5600,
    caption: 'You stay in charge — approve, edit or spike anything, in seconds.',
    Component: SceneEditor,
  },
  {
    id: 'close',
    duration: 6000,
    caption: 'Run one feed, or run ten. Curatr does the trawling — you keep the voice.',
    Component: SceneClose,
  },
];

/**
 * Extra hold after each presenter clip's nominal length. Clip durations are
 * measured to the frame, so advancing exactly on `duration` clips the last
 * syllable once decode/start latency is added. The pad keeps the tail intact.
 */
export const TAIL_PAD_MS = 600;

/** Beat length including the tail pad — use this everywhere for timing. */
export const sceneDuration = (scene: SceneDef) => scene.duration + TAIL_PAD_MS;

export const TOTAL_MS = TIMELINE.reduce((sum, s) => sum + sceneDuration(s), 0);
