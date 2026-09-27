// iOS launch images (apple-touch-startup-image): without one per screen size,
// the Home Screen app opens on a white screen. Portrait, every iPhone still
// getting iOS updates. Rendered by scripts/make-icons.ts, linked from the root layout.

export interface Screen {
  /** CSS pixels. */
  width: number;
  height: number;
  scale: number;
}

export const LAUNCH_IMAGES: readonly Screen[] = [
  { width: 440, height: 956, scale: 3 },
  { width: 402, height: 874, scale: 3 },
  { width: 430, height: 932, scale: 3 },
  { width: 393, height: 852, scale: 3 },
  { width: 428, height: 926, scale: 3 },
  { width: 390, height: 844, scale: 3 },
  { width: 375, height: 812, scale: 3 },
  { width: 414, height: 896, scale: 3 },
  { width: 414, height: 896, scale: 2 },
  { width: 375, height: 667, scale: 2 },
];

/** Size of the mark's box in CSS pixels, on the launch image and the loading splash alike, so one hands off to the other. */
export const SPLASH_MARK_SIZE = 120;

// iOS ignores a launch image whose query doesn't name all three.
export const launchImageMedia = (s: Screen) =>
  `(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.scale})`;

export const launchImageHref = (s: Screen) => `/splash/splash-${s.width}x${s.height}@${s.scale}x.png`;

export const launchImagePixels = (s: Screen) => ({ width: s.width * s.scale, height: s.height * s.scale });
