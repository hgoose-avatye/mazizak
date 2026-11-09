import type * as THREE from 'three';
import type { AudioEngine } from './audio';
import type { InputEvt } from './runtime';

export interface ToyContext {
  renderer: THREE.WebGLRenderer;
  audio: AudioEngine;
  requestFrame: () => void;
  /** canvas size in CSS px */
  size: () => { w: number; h: number };
  haptic: (ms: number) => void;
}

/** A toy owns its scene + camera; the runtime drives input/frames. */
export interface Toy {
  readonly id: string;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  resize(w: number, h: number): void;
  /** inside the DOM event handler (sound/haptics timing) */
  inputImmediate(e: InputEvt, raw: Event): void;
  /** per frame; return true while still animating */
  frame(dt: number, input: InputEvt[]): boolean;
  reset(): void;
  /** called when the toy becomes visible */
  enter(): void;
  leave(): void;
  stats?(): Record<string, string | number>;
  report?(): Record<string, unknown>;
}
