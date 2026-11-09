export type Quality = 'auto' | 'high' | 'saver';

export interface Settings {
  sound: boolean;
  volume: number; // 0..1
  haptics: boolean;
  quality: Quality;
  reduceMotion: boolean;
  showStats: boolean;
  squishyColor: string;
  keyPreset: 'pebble' | 'clack';
}

const KEY = 'mzk-settings-v1';

const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULTS: Settings = {
  sound: true,
  volume: 0.85,
  haptics: true,
  quality: 'auto',
  reduceMotion: prefersReduced,
  showStats: false,
  squishyColor: 'pink',
  keyPreset: 'pebble',
};

type Listener = (s: Settings, changed: keyof Settings) => void;

class Store {
  private s: Settings;
  private listeners = new Set<Listener>();

  constructor() {
    let saved: Partial<Settings> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    } catch {
      /* storage unavailable */
    }
    this.s = { ...DEFAULTS, ...saved };
  }

  get(): Readonly<Settings> {
    return this.s;
  }

  set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    if (this.s[k] === v) return;
    this.s = { ...this.s, [k]: v };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) l(this.s, k);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const settings = new Store();
