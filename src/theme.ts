import { Dimensions, Platform } from 'react-native';

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

// Sizes in the app are designed for a 400dp-wide phone and a 1600dp-wide TV,
// and scaled to the actual screen: small or low-density phones shrink a little,
// and a 1080p TV (usually 960dp wide) draws at 0.6, which fits about six cards
// across a row while the smallest text stays readable from across the room.
const window = Dimensions.get('window');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const UI_SCALE = isTV
  ? clamp(Math.max(window.width, window.height) / 1600, 0.5, 1.1)
  : clamp(Math.min(window.width, window.height) / 400, 0.8, 1.05);

/** A size given for phone and TV, scaled to this screen. */
export const sz = (phone: number, tv: number) => Math.round((isTV ? tv : phone) * UI_SCALE * 2) / 2;

// TVs are viewed from across the room; phones need tighter spacing. TVs also
// crop their edges (overscan), so the TV margin never shrinks below 48.
export const GUTTER = isTV ? 48 : sz(18, 48);
export const CARD_WIDTH = sz(230, 230);
export const CARD_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
export const CARD_GAP = sz(14, 20);
export const RADIUS = sz(14, 16);
// Room above and below a row of cards, so a focused card on TV (which grows
// and gets a ring) isn't clipped by the row.
export const ROW_PAD = isTV ? 18 : 2;

// The darkening laid over pictures so white text on them stays readable.
export const SCRIM = ['transparent', 'rgba(12,10,18,0.55)', 'rgba(12,10,18,0.96)'] as const;
// The purple haze behind the header.
export const GLOW = ['rgba(155,92,255,0.28)', 'rgba(155,92,255,0.06)', 'transparent'] as const;
