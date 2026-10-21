import { PlayerSettings } from './api/types';

export const colors = {
  bg: '#161512',
  card: '#262421',
  cardAlt: '#302e2b',
  border: '#3c3a37',
  text: '#f0efed',
  muted: '#a8a6a3',
  primary: '#81b64c',
  primaryDark: '#5d8a32',
  danger: '#e05252',
  warning: '#e3aa24',
  win: '#81b64c',
  loss: '#e05252',
  draw: '#a8a6a3',
  coin: '#f2c94c',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const boardThemes: Record<PlayerSettings['boardTheme'], { light: string; dark: string }> = {
  classic: { light: '#f0d9b5', dark: '#b58863' },
  green: { light: '#eeeed2', dark: '#769656' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  wood: { light: '#e8c99b', dark: '#a6714a' },
};
