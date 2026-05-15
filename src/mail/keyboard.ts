export type NavigationDirection = 'up' | 'down';

export type MailColumn = 'folders' | 'list' | 'content';

export const MAIL_COLUMNS: readonly MailColumn[] = ['folders', 'list', 'content'];

export const COMPOSE_EDITOR_ROOT_SELECTOR = '[data-mail-compose-editor]';

export function isModifiedKeyboardEvent(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

export function isVerticalNavigationKey(key: string): boolean {
  return key === 'ArrowUp' || key === 'ArrowDown';
}

export function isHorizontalNavigationKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'ArrowRight';
}

export function isDeleteSelectedItemShortcut(
  event: Pick<KeyboardEvent, 'metaKey' | 'key'>
): boolean {
  return event.metaKey && event.key === 'Backspace';
}

export function navigationDirectionFromKey(key: string): NavigationDirection | null {
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowUp') return 'up';
  return null;
}

export function targetIsEditableField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Ignore column-level shortcuts while typing in form fields or the compose editor. */
export function shouldIgnoreColumnShortcut(event: Pick<KeyboardEvent, 'target' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return isModifiedKeyboardEvent(event) || targetIsEditableField(event.target);
}

export function pickVerticalNeighbor<T>(
  items: readonly T[],
  selectedIndex: number,
  direction: NavigationDirection
): T | null {
  if (!items.length) return null;

  const startIndex =
    selectedIndex >= 0 ? selectedIndex : direction === 'down' ? -1 : items.length;
  const nextIndex = direction === 'down' ? startIndex + 1 : startIndex - 1;

  if (nextIndex < 0 || nextIndex >= items.length) return null;
  return items[nextIndex] ?? null;
}

export function findSelectedIndex<T>(
  items: readonly T[],
  isSelected: (item: T, index: number) => boolean
): number {
  return items.findIndex(isSelected);
}

export function escapeDataAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function scrollIntoViewByDataAttribute(
  attribute: string,
  value: string,
  root: ParentNode = document
): void {
  const selector = `[${attribute}="${escapeDataAttributeValue(value)}"]`;
  root.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'nearest' });
}

export function isFocusInComposeEditor(
  contentRoot: HTMLElement | null,
  activeElement: Element | null = document.activeElement
): boolean {
  if (!contentRoot || !activeElement) return false;
  const composeEditor = contentRoot.querySelector(COMPOSE_EDITOR_ROOT_SELECTOR);
  return Boolean(composeEditor?.contains(activeElement));
}

export function focusComposeEditor(contentRoot: HTMLElement | null): boolean {
  if (!contentRoot) return false;
  const composeRoot = contentRoot.querySelector(COMPOSE_EDITOR_ROOT_SELECTOR);
  if (!composeRoot) return false;
  const editable =
    composeRoot.querySelector<HTMLElement>('[contenteditable="true"]') ||
    composeRoot.querySelector<HTMLElement>('[contenteditable]');
  if (!editable) return false;
  editable.focus();
  return true;
}
