import { Platform } from 'react-native';

export const isTV = Platform.isTV;

export const colors = {
  background: '#0b0d12',
  surface: '#171a22',
  text: '#f2f3f5',
  muted: '#9aa0ab',
  accent: '#f5b301',
  live: '#e53935',
};

// TVs are viewed from across the room; phones need tighter spacing.
export const GUTTER = isTV ? 48 : 16;
export const CARD_WIDTH = isTV ? 240 : 200;
export const CARD_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
