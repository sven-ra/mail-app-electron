import type { ElectronApi } from '../types/electron-api';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function isExternalMailLinkUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return EXTERNAL_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

function getElectronApi(): ElectronApi | undefined {
  try {
    const topWin = globalThis.top as (Window & { electronAPI?: ElectronApi }) | null;
    if (topWin?.electronAPI) return topWin.electronAPI;
  } catch {
    /* cross-origin `top` */
  }
  const w = globalThis as unknown as Window & { electronAPI?: ElectronApi };
  return w.electronAPI;
}

/**
 * Intercept activation of http(s)/mailto links in email HTML so they open in the
 * system default handler instead of navigating the Electron window or iframe.
 */
export function interceptMailLinkActivation(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (event.type === 'auxclick' && event.button !== 1) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest('a[href], area[href]');
  if (!anchor) return;

  const raw = anchor.getAttribute('href');
  if (raw == null || raw.trim() === '') return;

  const trimmed = raw.trim();
  if (trimmed.startsWith('#')) return;

  let absolute: string;
  try {
    absolute = new URL(trimmed, anchor.baseURI).href;
  } catch {
    return;
  }

  if (!isExternalMailLinkUrl(absolute)) return;

  const api = getElectronApi();
  if (!api?.openExternalUrl) return;

  event.preventDefault();
  event.stopPropagation();
  void api.openExternalUrl(absolute);
}
