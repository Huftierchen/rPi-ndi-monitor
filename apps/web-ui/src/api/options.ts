// Select-option labels for receiver/logging unions.
//
// The `satisfies Record<Union, string>` clauses enforce exhaustiveness:
// adding a new literal to any of these union types in `./types.ts` without
// updating the corresponding record here will produce a TypeScript error.

import type { BandwidthMode, ColorFormat, DisplayMode, LogLevel, ScaleMode } from './types.ts';

export const SCALE_MODE_LABELS = {
  contain: 'contain — keep aspect, may letterbox',
  cover: 'cover — fill display, may crop',
  stretch: 'stretch — fill without preserving ratio',
} as const satisfies Record<ScaleMode, string>;

export const COLOR_FORMAT_LABELS = {
  fastest: 'fastest — recommended for Pi 5',
  uyvy: 'uyvy',
  rgba: 'rgba',
} as const satisfies Record<ColorFormat, string>;

export const BANDWIDTH_MODE_LABELS = {
  highest: 'highest — request full quality',
  lowest: 'lowest — proxy stream, easier on Pi 5',
} as const satisfies Record<BandwidthMode, string>;

export const LOG_LEVEL_LABELS = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const satisfies Record<LogLevel, string>;

export const SCALE_MODES = Object.keys(SCALE_MODE_LABELS) as ScaleMode[];
export const COLOR_FORMATS = Object.keys(COLOR_FORMAT_LABELS) as ColorFormat[];
export const BANDWIDTH_MODES = Object.keys(BANDWIDTH_MODE_LABELS) as BandwidthMode[];
export const LOG_LEVELS = Object.keys(LOG_LEVEL_LABELS) as LogLevel[];

export function formatDisplayModeLabel(mode: DisplayMode): string {
  const native = mode.isNative ? ' · native' : '';
  return `${mode.width}×${mode.height} · ${mode.refreshRate} Hz${native}`;
}
