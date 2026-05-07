import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '../mail/constants';

type ThemeMode = 'light' | 'dark';

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  function toggleThemeMode(): void {
    setThemeMode((currentThemeMode) => (currentThemeMode === 'dark' ? 'light' : 'dark'));
  }

  return { themeMode, toggleThemeMode };
}
