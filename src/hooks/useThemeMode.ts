import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '../mail/constants';
import { readInitialThemeMode, type ThemeMode } from '../mail/initialThemeMode';

export type { ThemeMode } from '../mail/initialThemeMode';

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  function toggleThemeMode(): void {
    setThemeMode((currentThemeMode) => (currentThemeMode === 'dark' ? 'light' : 'dark'));
  }

  return { themeMode, toggleThemeMode };
}
