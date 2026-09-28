import runUrl from "../assets/sprites/run.webp";
import slideUrl from "../assets/sprites/slide.webp";
import heroUrl from "../assets/sprites/hero.webp";
import defenderUrl from "../assets/sprites/defender.webp";
import coneUrl from "../assets/sprites/cone.webp";
import gateUrl from "../assets/sprites/gate.webp";
import boneUrl from "../assets/sprites/bone.webp";
import barrierUrl from "../assets/sprites/barrier.webp";
import stadiumUrl from "../assets/sprites/stadium.webp";
import strips from "../assets/sprites/strips.json";

/**
 * Artwork is prepared ahead of time by scripts/prepare-assets.py: sprite
 * sheets are cleaned and cut into registered frames, obstacles are trimmed
 * and sized, and everything is written as WebP. Loading here is a plain image
 * fetch with no pixel processing on the device. Vite fingerprints the file
 * names, which prevents stale CDN or WebView caches.
 */
export interface StripMeta {
  frames: number;
  width: number;
  height: number;
  /** Transparent rows below the lowest contact point in every cell. */
  groundMargin: number;
}

export interface GameAssets {
  /** Horizontal strip of run-cycle cells, all registered to one ground row. */
  run: HTMLImageElement;
  runMeta: StripMeta;
  slide: HTMLImageElement;
  slideMeta: StripMeta;
  defender: HTMLImageElement;
  cone: HTMLImageElement;
  gate: HTMLImageElement;
  bone: HTMLImageElement;
  barrier: HTMLImageElement;
  stadium: HTMLImageElement;
}

const MANIFEST = {
  run: runUrl,
  slide: slideUrl,
  defender: defenderUrl,
  cone: coneUrl,
  gate: gateUrl,
  bone: boneUrl,
  barrier: barrierUrl,
  stadium: stadiumUrl,
} as const;

type ImageKey = keyof typeof MANIFEST;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load sprite: ${url}`));
    image.src = url;
  });
}

let pending: Promise<GameAssets> | null = null;

export function loadAssets(): Promise<GameAssets> {
  if (!pending) {
    const keys = Object.keys(MANIFEST) as ImageKey[];
    pending = Promise.all(keys.map((key) => loadImage(MANIFEST[key]))).then((images) => {
      const byKey = Object.fromEntries(keys.map((key, i) => [key, images[i]])) as Record<ImageKey, HTMLImageElement>;
      return { ...byKey, runMeta: strips.run, slideMeta: strips.slide };
    });
  }
  return pending;
}

/** URL of the hero image shown on the start screen. */
export const HERO_IMAGE_URL = heroUrl;
