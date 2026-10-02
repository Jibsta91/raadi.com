import { useColorScheme } from 'react-native';

const light = {
  background: '#ffffff',
  surface: '#f4f5f7',
  text: '#16181d',
  muted: '#5c6370',
  border: '#dde1e6',
  accent: '#0063fb',
  accentText: '#ffffff',
  danger: '#c2261f',
  success: '#1f7a3f',
  badge: '#fff4d6',
  badgeText: '#7a5300',
};

const dark: typeof light = {
  background: '#101215',
  surface: '#1b1e23',
  text: '#eef0f3',
  muted: '#9aa3ae',
  border: '#2c3138',
  accent: '#5b9bff',
  accentText: '#0b1220',
  danger: '#ff7b72',
  success: '#56d364',
  badge: '#3d2f0a',
  badgeText: '#f2cc60',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
