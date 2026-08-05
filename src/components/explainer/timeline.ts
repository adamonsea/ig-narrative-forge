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
  /** Beat length in milliseconds. */
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
    duration: 7600,
    caption:
      "Local stories are out there. Finding them, writing them, and making them look good is the hard bit.",
    Component: SceneProblem,
  },
  {
    id: 'subject',
    duration: 6900,
    caption: 'Start with a place, or a subject. A town. A beat. A cause.',
    Component: SceneSubject,
  },
  {
    id: 'sources',
    duration: 6000,
    caption: 'Curatr trawls your sources for you — every day, in the background.',
    Component: SceneSources,
  },
  {
    id: 'filter',
    duration: 9000,
    caption: "It keeps what's genuinely local and relevant. The rest never reaches your audience.",
    Component: SceneFilter,
  },
  {
    id: 'written',
    duration: 6900,
    caption: "What's left is rewritten into clean, readable stories — and illustrated automatically.",
    Component: SceneWritten,
  },
  {
    id: 'publish',
    duration: 8500,
    caption: 'Then it publishes itself. Your own feed, your newsletter, a widget on your site, social carousels.',
    Component: ScenePublish,
  },
  {
    id: 'editor',
    duration: 6400,
    caption: 'You stay in charge — approve, edit, or spike anything, in seconds.',
    Component: SceneEditor,
  },
  {
    id: 'close',
    duration: 6200,
    caption: 'Run one feed, or run ten. Curatr does the trawling — you keep the voice.',
    Component: SceneClose,
  },
];

export const TOTAL_MS = TIMELINE.reduce((sum, s) => sum + s.duration, 0);