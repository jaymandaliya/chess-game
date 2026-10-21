import { PlayerSettings } from './api/types';

export const colors = {
  bg: '#0B0D12',
  surface: '#141821',
  surfaceAlt: '#1B2030',
  elevated: '#232A3B',
  border: '#272E40',
  text: '#F5F7FA',
  textSecondary: '#A9B1C3',
  muted: '#6E7790',
  primary: '#22C55E',
  primaryDark: '#15803D',
  primarySoft: 'rgba(34, 197, 94, 0.14)',
  onPrimary: '#052E16',
  accent: '#8B5CF6',
  accentSoft: 'rgba(139, 92, 246, 0.16)',
  gold: '#FBBF24',
  goldSoft: 'rgba(251, 191, 36, 0.14)',
  danger: '#F43F5E',
  dangerSoft: 'rgba(244, 63, 94, 0.14)',
  warning: '#F59E0B',
  win: '#22C55E',
  loss: '#F43F5E',
  draw: '#94A3B8',
  // kept for components written against the earlier palette
  card: '#141821',
  cardAlt: '#1B2030',
  coin: '#FBBF24',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const type = {
  hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.text },
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3, color: colors.text },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textSecondary },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' as const },
};

export const boardThemes: Record<PlayerSettings['boardTheme'], { light: string; dark: string }> = {
  classic: { light: '#f0d9b5', dark: '#b58863' },
  green: { light: '#ebecd0', dark: '#739552' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  wood: { light: '#e8c99b', dark: '#a6714a' },
};

// Stable colour per name for avatar initials
const AVATAR_COLORS = ['#22C55E', '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#3B82F6', '#14B8A6'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
