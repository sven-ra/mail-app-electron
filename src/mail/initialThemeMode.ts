import { THEME_STORAGE_KEY } from './constants';

export type ThemeMode = 'light' | 'dark';

/** Used by `useThemeMode` and kept in sync with the boot script in `src/index.html`. */
export function readInitialThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
