/**
 * The user's appearance choice. "system" (the default) follows the OS; "light" and "dark" override it.
 * Kept in a plain cookie (a display preference, not personal data) so the server can render
 * <html data-theme> and the first paint already has the right colours.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEMES)[number];

export const THEME_COOKIE = 'theme';

export function parseTheme(value: string | undefined): ThemePreference {
  return THEMES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

/** The data-theme attribute for a preference: none for "system", so CSS follows the OS. */
export function themeAttribute(theme: ThemePreference): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}
