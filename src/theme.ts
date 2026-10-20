import { Platform } from 'react-native';

export const isTV = Platform.isTV;

export const colors = {
  background: '#0c0a12',
  surface: '#17141f',
  surfaceRaised: '#211c2c',
  border: 'rgba(255,255,255,0.08)',
  text: '#f6f4fa',
  muted: '#9d97ab',
  faint: '#5f596c',
  accent: '#9b5cff',
  accentDeep: '#6d35e0',
  accentSoft: 'rgba(155,92,255,0.18)',
  live: '#ff3b5c',
};

// TVs are viewed from across the room; phones need tighter spacing.
export const GUTTER = isTV ? 48 : 18;
export const CARD_WIDTH = isTV ? 300 : 230;
export const CARD_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
export const CARD_GAP = isTV ? 20 : 14;
export const RADIUS = isTV ? 16 : 14;

// The darkening laid over pictures so white text on them stays readable.
export const SCRIM = ['transparent', 'rgba(12,10,18,0.55)', 'rgba(12,10,18,0.96)'] as const;
// The purple haze behind the header.
export const GLOW = ['rgba(155,92,255,0.28)', 'rgba(155,92,255,0.06)', 'transparent'] as const;
