// Shared contract between the particle engine (main.ts) and UI/audio modules.
// The engine installs `window.stars` implementing StarsAPI before firing 'stars:ready'.

export type ShapeName = 'galaxy' | 'sphere' | 'knot' | 'heart' | 'dna' | 'saturn' | 'text';

export interface ShapeData {
  /** N*4 floats: x,y,z,w (w unused, set 1). World units: shapes fit roughly in a radius-20 sphere. */
  positions: Float32Array;
  /** N*4 floats: r,g,b,a in 0..1. */
  colors: Float32Array;
}

export interface StarsAPI {
  /** Morph particles into the given text (emoji ok). Empty string returns to the previous shape. */
  setText(text: string): void;
  /** Morph to a named shape. */
  setShape(name: Exclude<ShapeName, 'text'>): void;
  /** Cycle to the next shape. */
  next(): void;
  /** Currently displayed text ('' if a shape is showing) and shape name. */
  getState(): { text: string; shape: ShapeName; count: number };
  /** Render one frame and return a PNG blob of the canvas. */
  screenshot(): Promise<Blob>;
  /** Pause/resume idle auto-cycling of shapes (UI calls pause while the input is focused). */
  setAutoCycle(on: boolean): void;
}

/** Events dispatched on window by the engine. */
export type StarsEvent =
  | { type: 'stars:ready' }            // engine ready, window.stars is set
  | { type: 'stars:morph'; detail: { shape: ShapeName; text: string } }
  | { type: 'stars:collapse' }         // user is holding: particles collapsing into a black hole
  | { type: 'stars:burst' }            // user released: particles explode outward
  | { type: 'stars:fps'; detail: { fps: number } };

declare global {
  interface Window { stars?: StarsAPI }
}

export interface AudioAPI {
  /** Must be called from a user gesture. Idempotent. */
  start(): Promise<void>;
  toggle(): boolean;      // returns new "on" state
  isOn(): boolean;
  /** Short soft whoosh for a morph. */
  whoosh(): void;
  /** Rising tension while collapsing; stop when released. */
  collapseStart(): void;
  collapseStop(): void;
  /** Big burst sound. */
  burst(): void;
}
